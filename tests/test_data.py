import json
from pathlib import Path
import pytest
from prepare_core_data import normalize, number


def record(**changes):
    return {"Week Ending Date": "2026-09-12", "Health District": "New River", "Health Region": "Southwest",
            "Facility Type": "Emergency Department", "Report Date": "Sep 15 2026  9:00AM",
            "Percent of ED Visits Covid": "1.1", "Percent of ED Visits Influenza": "0.1",
            "Percent of ED Visits RSV": "0.0", "Percent of ED Visits Combined": "1.2",
            "Combined Respiratory Viruses Count": "*", **changes}


def test_suppression_is_missing_not_zero():
    r = normalize([record()], 'test-snapshot')[0]
    assert r['combined_count'] is None and r['count_suppressed']
    assert r['combined_pct'] == 1.2
    assert number('0') == 0 and number('*') is None


def test_duplicate_grain_rejected():
    with pytest.raises(ValueError, match='Duplicate'):
        normalize([record(), record()], 'test')


def test_invalid_percent_rejected():
    with pytest.raises(ValueError, match='Percentage'):
        normalize([record(**{'Percent of ED Visits Combined': '101'})], 'test')


def test_service_sources_and_concurrent_therapy_constraint():
    from urllib.parse import urlparse
    services = json.loads(Path('data/contracts/services.json').read_text())
    for s in services:
        u = urlparse(s['source_url'])
        assert u.scheme == 'https' and u.hostname.endswith('.vt.edu')
    scheduled = next(s for s in services if s['id'] == 'timely-scheduled')
    assert 'concurrently' in scheduled['constraints'] and 'Cook' in scheduled['constraints']
