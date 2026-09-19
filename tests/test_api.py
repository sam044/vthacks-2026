import json
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from hokiecare import app as api


@pytest.fixture
def client(monkeypatch):
    api.cache.clear()
    api.requests_window.clear()
    monkeypatch.setattr(api, 'db_client', lambda: object())
    return TestClient(api.app)


def test_health_independent_of_database(client, monkeypatch):
    monkeypatch.setattr(api, 'execute', lambda *a, **k: (_ for _ in ()).throw(RuntimeError('secret')))
    assert client.get('/api/health').status_code == 200
    result = client.get('/api/ready')
    assert result.status_code == 503 and 'secret' not in result.text


def test_filters_and_cache(client, monkeypatch):
    calls = []
    def execute(*args):
        calls.append(args)
        return json.loads(Path('data/contracts/services.json').read_text()), 'test-statement'
    monkeypatch.setattr(api, 'execute', execute)
    first = client.get('/api/services?category=mental-health&modality=virtual').json()
    assert len(first['services']) == 2 and first['data']['mode'] == 'live'
    second = client.get('/api/services?category=accessibility').json()
    assert len(second['services']) == 1 and second['data']['mode'] == 'cached'
    assert len(calls) == 1
    assert client.get('/api/services?category=%27%3BDELETE').status_code == 422


def test_warehouse_timeout_is_retryable(client, monkeypatch):
    def fail(*args):
        raise TimeoutError('test')
    monkeypatch.setattr(api, 'execute', fail)
    response = client.get('/api/trends')
    assert response.status_code == 503 and response.headers['Retry-After'] == '15'


def test_trends_suppression_and_comparison(client, monkeypatch):
    def point(week, value):
        return dict(week=week, facility='Emergency Department', combined_pct=value, covid_pct='0.2',
                    influenza_pct='0.0', rsv_pct=None, combined_count=None, count_suppressed='true')
    monkeypatch.setattr(api, 'execute', lambda *a: ([point('2026-09-05','1.0'), point('2026-09-12','1.4')], 'test'))
    r = client.get('/api/trends').json()
    assert r['change_percentage_points'] == .4
    assert r['latest']['combined_count'] is None and r['latest']['count_suppressed']
    assert client.get('/api/trends?weeks=99999').status_code == 422
    assert client.get('/api/trends?facility=Virginia%20Tech').status_code == 422


def test_no_week_over_week_claim_across_gap(client, monkeypatch):
    points = [dict(week=day, facility='Urgent Care', combined_pct='1.0', covid_pct=None,
                   influenza_pct=None, rsv_pct=None, combined_count=None, count_suppressed='false')
              for day in ['2026-08-29','2026-09-12']]
    monkeypatch.setattr(api, 'execute', lambda *a: (points, 'test'))
    assert client.get('/api/trends?facility=Urgent%20Care').json()['change_percentage_points'] is None


def test_expired_cache_does_not_hide_outage(client, monkeypatch):
    import time
    api.cache['services'] = (time.monotonic() - api.CACHE_SECONDS - 1, [{'name': 'stale'}], {})
    monkeypatch.setattr(api, 'execute', lambda *a: (_ for _ in ()).throw(RuntimeError('credentials')))
    assert client.get('/api/services').status_code == 503


def test_rate_limit_is_bounded(client):
    import time
    api.requests_window.extend([time.monotonic()] * 180)
    assert client.get('/api/services').status_code == 429
    assert client.get('/api/health').status_code == 200
