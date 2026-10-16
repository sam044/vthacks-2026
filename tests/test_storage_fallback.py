from datetime import datetime, timedelta
import pytest
from fastapi.testclient import TestClient
from hokiecare import app as api
from hokiecare import booking, booking_store, scheduling as s

H = {'X-HokieCare-Action': '1'}


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv('HOKIECARE_BOOKING_DB', str(tmp_path / 'fallback.sqlite3'))
    monkeypatch.setenv('HOKIECARE_COOKIE_SECURE', 'false')
    monkeypatch.setenv('HOKIECARE_BOOKING_STORE', 'lakebase')
    monkeypatch.setitem(booking.fallback, 'reason', None)
    monkeypatch.setitem(booking.fallback, 'since', None)
    api.requests_window.clear()
    api.status_cache.clear()
    return TestClient(api.app)


def open_slot(client):
    day = datetime.now(s.TZ).date() + timedelta(days=1)
    while s.day_reason(s.service('cook-counseling'), day):
        day += timedelta(days=1)
    result = client.get('/api/booking/availability', params={'service_id': 'cook-counseling', 'from': str(day),
                                                             'to': str(day + timedelta(days=1)), 'mode': 'demo'})
    return next(x for x in result.json()['slots'] if x['state'] == 'available')


def test_unreachable_lakebase_falls_back_to_sqlite_for_the_whole_flow(client, monkeypatch):
    def unreachable():
        raise booking_store.LakebaseUnavailable('PoolTimeout')
    monkeypatch.setattr(booking_store, 'lakebase_database', unreachable)
    assert client.post('/api/booking/session', headers=H).status_code == 200
    assert booking.fallback['reason'] == 'PoolTimeout'
    assert client.get('/api/booking/catalog').json()['storage'] == 'sqlite-fallback'
    slot = open_slot(client)
    review = client.post('/api/booking/proposals', headers=H, json={
        'slot_id': slot['id'], 'version': slot['version'], 'request_id': 'fallback-request-123456'}).json()
    saved = client.post(f"/api/booking/proposals/{review['id']}/confirm", headers=H)
    assert saved.status_code == 200 and saved.json()['status'] == 'reserved'
    assert [a['slot_id'] for a in client.get('/api/booking/appointments').json()['appointments']] == [slot['id']]


def test_missing_lakebase_configuration_is_treated_as_unreachable(client, monkeypatch):
    for name in ('PGHOST', 'PGUSER', 'LAKEBASE_ENDPOINT'):
        monkeypatch.delenv(name, raising=False)
    booking_store.connection_pool.cache_clear()
    assert client.post('/api/booking/session', headers=H).status_code == 200
    assert booking.storage() == 'sqlite-fallback'


def test_lost_connection_mid_request_fails_once_then_uses_fallback(client, monkeypatch):
    from contextlib import contextmanager

    @contextmanager
    def drops():
        try:
            yield object()
        except Exception:
            raise booking_store.StorageUnavailable('OperationalError') from None
    monkeypatch.setattr(booking_store, 'lakebase_database', drops)
    with pytest.raises(Exception) as error:
        with booking.database():
            raise RuntimeError('connection closed')
    assert getattr(error.value, 'status_code', None) == 503
    assert booking.storage() == 'sqlite-fallback'
    assert client.post('/api/booking/session', headers=H).status_code == 200


def test_contention_timeouts_do_not_switch_stores(client, monkeypatch):
    from contextlib import contextmanager
    @contextmanager
    def busy():
        try:
            yield object()
        except Exception:
            raise booking_store.StorageUnavailable(None) from None
    monkeypatch.setattr(booking_store, 'lakebase_database', busy)
    with pytest.raises(Exception) as error:
        with booking.database():
            raise RuntimeError('lock timeout')
    assert getattr(error.value, 'status_code', None) == 503 and booking.storage() == 'lakebase'


def test_status_reports_error_classes_only(client, monkeypatch):
    booking.fallback['reason'] = 'PoolTimeout'
    monkeypatch.setattr(api, 'db_client', lambda: (_ for _ in ()).throw(PermissionError('secret token text')))
    result = client.get('/api/status').json()
    assert result['databricks_auth'] == 'PermissionError' and result['sql_warehouse'] == 'PermissionError'
    assert result['booking_storage'] == 'sqlite-fallback' and result['booking_fallback_reason'] == 'PoolTimeout'
    assert 'secret' not in str(result)


def test_failed_warehouse_is_skipped_until_the_outage_window_ends(client, monkeypatch):
    calls = []
    def failing(*args, **kwargs):
        calls.append(1)
        raise ConnectionError('unreachable')
    monkeypatch.setattr(api, 'execute', failing)
    monkeypatch.setattr(api, 'db_client', lambda: object())
    api.cache.clear()
    for _ in range(3):
        result = client.get('/api/services').json()
        assert result['data']['mode'] == 'snapshot' and result['services']
    assert len(calls) == 1
    api.outages.clear()
    client.get('/api/services')
    assert len(calls) == 2


def test_expired_outage_rechecks_in_background_and_recovers(client, monkeypatch):
    import threading, time
    checked = threading.Event()
    monkeypatch.setattr(api, 'execute', lambda *a, **k: (checked.set(), ([{'id': 'live'}], 'statement'))[1])
    monkeypatch.setattr(api, 'db_client', lambda: object())
    api.cache.clear()
    api.outages['sql'] = time.monotonic() - 1
    assert client.get('/api/services').json()['data']['mode'] == 'snapshot'
    assert checked.wait(5)
    for _ in range(50):
        if 'sql' not in api.outages: break
        time.sleep(0.05)
    assert client.get('/api/services').json()['data']['mode'] == 'live'
