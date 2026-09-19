"""Exercise the public deployment without credentials; save compact evidence."""
import argparse
import json
from datetime import datetime, timezone
from urllib.error import HTTPError
from urllib.request import urlopen


def verify(base, expected_commit=None):
    def get(path):
        with urlopen(base.rstrip('/') + path, timeout=90) as response:
            return json.load(response)
    health = get('/api/health')
    assert health['status'] == 'ok'
    if expected_commit:
        assert health['commit'] == expected_commit, (health['commit'], expected_commit)
    assert get('/api/ready')['status'] == 'ready'
    services = get('/api/services')
    assert len(services['services']) == 6
    assert services['data']['statement_id'] and services['data']['provider'] == 'Databricks SQL'
    virtual = get('/api/services?category=mental-health&modality=virtual')
    assert {r['id'] for r in virtual['services']} == {'timely-scheduled', 'timely-talknow'}
    trends = get('/api/trends?weeks=350')
    assert len(trends['points']) == 350
    assert trends['points'][0]['week'] == '2020-01-04'
    assert trends['latest']['week'] == '2026-09-12'
    urgent = get('/api/trends?facility=Urgent%20Care&weeks=350')
    assert len(urgent['points']) == 350
    suppressed = [p for data in [trends, urgent] for p in data['points'] if p['count_suppressed']]
    assert len(suppressed) == 64 and all(p['combined_count'] is None for p in suppressed)
    try:
        get('/api/trends?weeks=10000')
        raise AssertionError('Expected validation failure')
    except HTTPError as error:
        assert error.code == 422
    with urlopen(base, timeout=30) as response:
        assert 'HokieCare' in response.read().decode()
        assert response.headers['X-Content-Type-Options'] == 'nosniff'
    return {'checked_at': datetime.now(timezone.utc).isoformat(), 'url': base,
            'commit': health['commit'], 'services': 6, 'new_river_records': 700,
            'suppressed_combined_counts': 64, 'latest_week': trends['latest']['week'],
            'services_statement': services['data']['statement_id'], 'trends_statement': trends['data']['statement_id'],
            'checks': ['health', 'data readiness', 'directory', 'virtual filter', '350 ED weeks',
                       '350 urgent-care weeks', 'suppression preserved', 'invalid input 422', 'frontend + security header']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('base')
    parser.add_argument('--commit')
    args = parser.parse_args()
    print(json.dumps(verify(args.base, args.commit), indent=2))
