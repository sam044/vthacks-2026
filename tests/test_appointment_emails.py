from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
import msal
from hokiecare import app, appointment_emails as emails, booking as b, mailer

HEADERS = {'X-HokieCare-Action': '1'}


@pytest.fixture
def env(monkeypatch, tmp_path):
    token_file = tmp_path / 'graph-token.bin'
    token_key = Fernet.generate_key().decode()
    cache = msal.SerializableTokenCache()
    token_file.write_bytes(Fernet(token_key.encode()).encrypt(cache.serialize().encode()))
    settings = {'HOKIECARE_BOOKING_DB': str(tmp_path / 'mail.sqlite3'), 'HOKIECARE_EMAIL_ENABLED': 'true',
                'HOKIECARE_PUBLIC_ORIGIN': 'http://127.0.0.1:8000', 'HOKIECARE_COOKIE_SECURE': 'false',
                'MS_GRAPH_CLIENT_ID': '00000000-0000-0000-0000-000000000001',
                'MS_GRAPH_TOKEN_KEY': token_key, 'MS_GRAPH_TOKEN_CACHE': str(token_file)}
    for name, value in settings.items():
        monkeypatch.setenv(name, value)
    monkeypatch.delenv('HOKIECARE_BOOKING_STORE', raising=False)
    app.requests_window.clear()
    clock = [datetime.now(timezone.utc).timestamp()]
    monkeypatch.setattr(emails, 'time', SimpleNamespace(time=lambda: clock[0]))
    sent = []
    monkeypatch.setattr(mailer, 'send', lambda *args: sent.append(args))
    return SimpleNamespace(client=TestClient(app.app), clock=clock, sent=sent, monkeypatch=monkeypatch)


def seed(env, ident='fixture', address='student@example.test', hours=72):
    start = datetime.fromtimestamp(env.clock[0], timezone.utc) + timedelta(hours=hours)
    with b.database() as db:
        db.execute('INSERT INTO mock_email_schedule(id,email,health_center,starts_at) VALUES (?,?,?,?)',
                   (ident, address, 'Schiffert Health Center', start.isoformat()))
    return ident


def request(env, email='student@example.test', **extra):
    return env.client.post('/api/booking/email/request', headers=HEADERS, json={'email': email, 'consent': True, **extra})


def test_two_tables_exact_lookup_and_generic_response(env):
    seed(env)
    found = request(env, 'Student@Example.Test')
    missing = request(env, 'missing@example.test')
    assert found.status_code == missing.status_code == 202
    assert found.json() == missing.json()
    assert 'Schiffert' not in found.text
    with b.database() as db:
        names = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        assert 'appointment_email_signups' not in names and 'appointment_email_limits' not in names
        assert db.execute('SELECT COUNT(*) FROM appointment_email_jobs').fetchone()[0] == 2
    assert emails.deliver_due() == 1
    assert env.sent[0][0] == 'student@example.test'
    assert 'Schiffert Health Center' in env.sent[0][2] and 'DEMO' in env.sent[0][1]


def test_confirmation_then_24h_reminder_idempotent(env):
    seed(env)
    assert request(env).status_code == 202
    assert request(env).status_code == 202
    assert emails.deliver_due() == 1
    assert emails.deliver_due() == 0
    env.clock[0] += 48 * 3600 + 1
    assert emails.deliver_due() == 1
    assert 'reminder' in env.sent[-1][1]
    assert emails.deliver_due() == 0
    assert len(env.sent) == 2


def test_short_notice_only_confirmation_and_past_skipped(env):
    seed(env, hours=12)
    request(env)
    assert emails.deliver_due() == 1
    env.clock[0] += 13 * 3600
    assert emails.deliver_due() == 0


@pytest.mark.parametrize('field,value', [('consent', False), ('email', 'x\r\nBcc:y@example.test'), ('health_center', 'Injected')])
def test_validation(env, field, value):
    seed(env)
    assert request(env, **{field: value}).status_code == 422
    assert not env.sent


def test_unconfigured_and_csrf(env):
    assert env.client.post('/api/booking/email/request', json={'email': 'student@example.test', 'consent': True}).status_code == 403
    env.monkeypatch.setenv('HOKIECARE_EMAIL_ENABLED', 'false')
    assert request(env).status_code == 503
    assert env.client.get('/api/booking/email/settings').json()['enabled'] is False


def test_cancellation_and_recipient_changes_do_not_leak(env):
    seed(env)
    request(env)
    with b.database() as db:
        db.execute("UPDATE mock_email_schedule SET email='different@example.test',revision=revision+1")
    assert emails.deliver_due() == 0
    request(env, 'different@example.test')
    with b.database() as db:
        db.execute("UPDATE mock_email_schedule SET status='cancelled'")
    assert emails.deliver_due() == 0


def test_reschedule_revision_sends_updated_database_time(env):
    seed(env)
    request(env)
    start = datetime.fromtimestamp(env.clock[0], timezone.utc) + timedelta(days=4)
    with b.database() as db:
        db.execute("UPDATE mock_email_schedule SET starts_at=?,health_center='Cook Counseling Center',revision=2", (start.isoformat(),))
    assert emails.deliver_due() == 1
    assert 'Cook Counseling Center' in env.sent[0][2]
    assert start.astimezone(b.TZ).strftime('%I:%M %p %Z') in env.sent[0][2]
    assert emails.deliver_due() == 0


def test_stop_link_cancels_both_jobs_and_stays_stopped(env):
    seed(env)
    request(env)
    with b.database() as db:
        row = db.execute('SELECT id,cancel_token FROM appointment_email_jobs LIMIT 1').fetchone()
    path = f"/api/booking/email/{row['id']}/stop"
    assert env.client.post(path, headers=HEADERS, json={'token': 'wrong' * 10}).status_code == 404
    assert env.client.post(path, headers=HEADERS, json={'token': row['cancel_token']}).status_code == 200
    request(env)
    assert emails.deliver_due() == 0


def test_workers_claim_once_and_recover_abandoned_claim(env):
    seed(env)
    request(env)
    with b.database() as db:
        db.execute("UPDATE appointment_email_jobs SET state='sending',lease_until=0 WHERE kind='confirmation'")
    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(lambda _: emails.deliver_due(), range(2)))
    assert sum(results) == 1 and len(env.sent) == 1


def test_failures_are_bounded_and_redacted(env):
    seed(env)
    request(env)
    def fail(*args):
        raise RuntimeError('Secret Graph token and personal email')
    env.monkeypatch.setattr(mailer, 'send', fail)
    for _ in range(5):
        assert emails.deliver_due() == 0
        env.clock[0] += 3601
    with b.database() as db:
        row = db.execute("SELECT * FROM appointment_email_jobs WHERE kind='confirmation'").fetchone()
        assert row['attempts'] == 5 and row['state'] == 'failed' and row['error_class'] == 'RuntimeError'


def test_graph_uses_mail_send_only_and_accepted_payload(monkeypatch, tmp_path):
    token_key = Fernet.generate_key().decode()
    token_file = tmp_path / 'cache.bin'
    cache = msal.SerializableTokenCache()
    mailer.save_cache(cache, {'token_cache': token_file, 'token_key': token_key})
    for key, value in {'HOKIECARE_EMAIL_ENABLED': 'true', 'HOKIECARE_PUBLIC_ORIGIN': 'https://app.example.test',
                       'MS_GRAPH_CLIENT_ID': '00000000-0000-0000-0000-000000000001',
                       'MS_GRAPH_TOKEN_KEY': token_key, 'MS_GRAPH_TOKEN_CACHE': str(token_file)}.items():
        monkeypatch.setenv(key, value)
    class Application:
        def __init__(self, client_id, authority, token_cache):
            assert authority.endswith('/consumers')
        def get_accounts(self): return [{'username': 'sender@outlook.com'}]
        def acquire_token_silent(self, scopes, account):
            assert scopes == ['https://graph.microsoft.com/Mail.Send']
            return {'access_token': 'test-access-token'}
    captured = {}
    def post(url, **kwargs):
        captured.update(url=url, **kwargs)
        return SimpleNamespace(status_code=202)
    monkeypatch.setattr(mailer.msal, 'PublicClientApplication', Application)
    monkeypatch.setattr(mailer.requests, 'post', post)
    mailer.send('student@example.test', 'DEMO', 'Mock appointment', 'stable-job-id')
    assert captured['url'] == 'https://graph.microsoft.com/v1.0/me/sendMail'
    assert captured['headers']['Authorization'] == 'Bearer test-access-token'
    message = captured['json']['message']
    assert message['toRecipients'][0]['emailAddress']['address'] == 'student@example.test'
    assert message['internetMessageHeaders'][0]['value'] == 'stable-job-id'
    assert captured['json']['saveToSentItems'] is True
    assert captured['timeout'] == 20


def test_graph_cache_is_encrypted_and_invalid_configuration_is_not_ready(monkeypatch, tmp_path):
    key = Fernet.generate_key().decode()
    path = tmp_path / 'token.bin'
    cache = msal.SerializableTokenCache()
    config = {'token_cache': path, 'token_key': key}
    mailer.save_cache(cache, config)
    assert path.read_bytes() != cache.serialize().encode()
    assert mailer.load_cache(config).serialize() == cache.serialize()
    monkeypatch.setenv('HOKIECARE_EMAIL_ENABLED', 'true')
    monkeypatch.setenv('HOKIECARE_PUBLIC_ORIGIN', 'https://app.example.test')
    monkeypatch.setenv('MS_GRAPH_CLIENT_ID', 'client-id')
    monkeypatch.setenv('MS_GRAPH_TOKEN_KEY', 'not-a-fernet-key')
    monkeypatch.setenv('MS_GRAPH_TOKEN_CACHE', str(path))
    assert mailer.ready() is False


def test_graph_failure_does_not_expose_provider_response(monkeypatch, tmp_path):
    token_key = Fernet.generate_key().decode()
    token_file = tmp_path / 'cache.bin'
    mailer.save_cache(msal.SerializableTokenCache(), {'token_cache': token_file, 'token_key': token_key})
    for key, value in {'HOKIECARE_EMAIL_ENABLED': 'true', 'HOKIECARE_PUBLIC_ORIGIN': 'https://app.example.test',
                       'MS_GRAPH_CLIENT_ID': '00000000-0000-0000-0000-000000000001',
                       'MS_GRAPH_TOKEN_KEY': token_key, 'MS_GRAPH_TOKEN_CACHE': str(token_file)}.items():
        monkeypatch.setenv(key, value)
    class Application:
        def __init__(self, *args, **kwargs): pass
        def get_accounts(self): return [{}]
        def acquire_token_silent(self, scopes, account): return {'access_token': 'secret-token'}
    monkeypatch.setattr(mailer.msal, 'PublicClientApplication', Application)
    monkeypatch.setattr(mailer.requests, 'post', lambda *args, **kwargs:
                        SimpleNamespace(status_code=401, text='private account details and secret-token'))
    with pytest.raises(RuntimeError) as error:
        mailer.send('student@example.test', 'DEMO', 'Mock appointment', 'job-id')
    assert str(error.value) == 'Microsoft Graph send failed with HTTP 401'
