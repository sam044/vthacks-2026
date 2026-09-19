"""Reviewed demo policies. Never infer real provider inventory from these rules."""
from datetime import date, datetime, time, timedelta, timezone
import json
from pathlib import Path
from zoneinfo import ZoneInfo
from fastapi import HTTPException

TZ = ZoneInfo('America/New_York')
CONFIG = json.loads(Path(__file__).with_name('schedules.json').read_text())
SERVICES = {s['id']: s for s in CONFIG['services']}


def validate_config():
    assert CONFIG['timezone'] == 'America/New_York'
    assert len(SERVICES) == len(CONFIG['services'])
    for s in SERVICES.values():
        assert 0 < s['duration_minutes'] <= 120 and s['capacity'] == 1
        assert 0 < s['grid_minutes'] <= 60 and 0 <= s['buffer_minutes'] <= 60
        for weekday, intervals in s['weekly'].items():
            assert 0 <= int(weekday) <= 6
            previous = '00:00'
            for begin, end in intervals:
                assert previous <= begin < end
                time.fromisoformat(begin); time.fromisoformat(end)
                previous = end
    for e in CONFIG['exceptions']:
        assert date.fromisoformat(e['from']) < date.fromisoformat(e['to'])


validate_config()


def service(ident):
    if ident not in SERVICES:
        raise HTTPException(422, 'Choose a supported scheduled service.')
    return SERVICES[ident]


def day_reason(s, day, now=None):
    today = (now or datetime.now(TZ)).astimezone(TZ).date()
    if day < today:
        return 'Outside booking window'
    if not CONFIG['effective_from'] <= day.isoformat() < CONFIG['effective_to']:
        return 'Schedule rules not reviewed for this date'
    for e in CONFIG['exceptions']:
        if (s['campus'] or s['id'] in e.get('services', [])) and e['from'] <= day.isoformat() < e['to']:
            return e['label']
    if not s['weekly'].get(str(day.weekday())):
        return 'Closed in demo schedule'
    return None


def local_instant(day, wall):
    local = datetime.combine(day, time.fromisoformat(wall), TZ)
    # Reject gaps and ambiguous folds rather than silently shifting appointments.
    if local.utcoffset() != local.replace(fold=1).utcoffset():
        raise ValueError('Ambiguous or nonexistent schedule time')
    utc = local.astimezone(timezone.utc)
    if utc.astimezone(TZ).replace(tzinfo=None) != local.replace(tzinfo=None):
        raise ValueError('Nonexistent schedule time')
    return utc


def candidates(ident, day, now=None):
    s = service(ident)
    now = now or datetime.now(timezone.utc)
    if day_reason(s, day, now):
        return []
    result = []
    for begin, end in s['weekly'].get(str(day.weekday()), []):
        start, close = local_instant(day, begin), local_instant(day, end)
        while start + timedelta(minutes=s['duration_minutes'] + s['buffer_minutes']) <= close:
            if start > now:
                result.append(dict(id=f"{ident}:{start.strftime('%Y%m%dT%H%MZ')}:v{CONFIG['version']}", service_id=ident,
                    center_id=s['center_id'], resource_id=s['resource_id'], starts=start.isoformat(),
                    ends=(start+timedelta(minutes=s['duration_minutes'])).isoformat(),
                    local_date=day.isoformat(), blocked_until=(start+timedelta(minutes=s['duration_minutes']+s['buffer_minutes'])).isoformat(), version=CONFIG['version'], origin='demo', state='available'))
            start += timedelta(minutes=s['grid_minutes'])
    return result


def resolve_slot(ident, db=None):
    from . import booking as b
    from contextlib import nullcontext
    with (nullcontext(db) if db is not None else b.database()) as db:
        row = db.execute('SELECT * FROM slots WHERE id=? AND active=1 AND version=?', (ident,CONFIG['version'])).fetchone()
    if not row or datetime.fromisoformat(row['starts']) <= datetime.now(timezone.utc):
        raise HTTPException(409, 'This time is outside the current schedule. Refresh availability.')
    return dict(row)


def public_services():
    return [{**s, 'source': 'demo', 'connection': 'not_connected',
             'capabilities': {'can_read_slots': False, 'can_submit': False, 'can_confirm': False,
                              'can_cancel': False, 'can_reschedule': False},
             'demo_capabilities': {'can_read_slots': True, 'can_submit': True, 'can_confirm': True,
                                  'can_cancel': True, 'can_reschedule': True}}
            for s in SERVICES.values()]
