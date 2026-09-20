"""Microsoft Graph transport for one authorized personal Outlook mailbox."""
import os
from pathlib import Path
import threading
from urllib.parse import urlsplit

from cryptography.fernet import Fernet, InvalidToken
import msal
import requests

SCOPES = ['https://graph.microsoft.com/Mail.Send']
AUTHORITY = 'https://login.microsoftonline.com/consumers'
GRAPH_SEND = 'https://graph.microsoft.com/v1.0/me/sendMail'
_cache_lock = threading.Lock()


def settings(require_cache=True):
    if os.environ.get('HOKIECARE_EMAIL_ENABLED', '').lower() != 'true':
        raise ValueError('Email is disabled')
    origin = os.environ['HOKIECARE_PUBLIC_ORIGIN'].rstrip('/')
    parsed = urlsplit(origin)
    local = parsed.scheme == 'http' and parsed.hostname in ('localhost', '127.0.0.1')
    if (parsed.scheme != 'https' and not local) or not parsed.netloc or parsed.path or parsed.query or parsed.fragment or parsed.username:
        raise ValueError('Invalid public origin')
    client_id = os.environ['MS_GRAPH_CLIENT_ID'].strip()
    token_key = os.environ['MS_GRAPH_TOKEN_KEY'].strip()
    path = Path(os.environ.get('MS_GRAPH_TOKEN_CACHE', '.secrets/microsoft-graph-cache.bin')).expanduser()
    if not path.is_absolute():
        path = Path.cwd() / path
    if not client_id or not token_key:
        raise ValueError('Incomplete Microsoft Graph settings')
    try:
        Fernet(token_key.encode())
    except (ValueError, TypeError):
        raise ValueError('Invalid Microsoft Graph token key') from None
    if require_cache and (not path.is_file() or path.is_symlink()):
        raise ValueError('Microsoft Outlook account is not connected')
    return dict(origin=origin, client_id=client_id, token_key=token_key, token_cache=path)


def ready():
    try:
        load_cache(settings())
        return True
    except (KeyError, ValueError, InvalidToken, OSError):
        return False


def load_cache(config):
    cache = msal.SerializableTokenCache()
    encrypted = config['token_cache'].read_bytes()
    cache.deserialize(Fernet(config['token_key'].encode()).decrypt(encrypted).decode())
    return cache


def save_cache(cache, config):
    """Atomically persist rotated refresh tokens; never print cache content."""
    path = config['token_cache']
    path.parent.mkdir(parents=True, exist_ok=True)
    encrypted = Fernet(config['token_key'].encode()).encrypt(cache.serialize().encode())
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_bytes(encrypted)
    try:
        os.chmod(temporary, 0o600)
    except OSError:
        pass
    temporary.replace(path)


def send(recipient, subject, body, message_id):
    config = settings()
    with _cache_lock:
        cache = load_cache(config)
        application = msal.PublicClientApplication(
            config['client_id'], authority=AUTHORITY, token_cache=cache)
        accounts = application.get_accounts()
        if len(accounts) != 1:
            raise RuntimeError('Microsoft Outlook account authorization is unavailable')
        result = application.acquire_token_silent(SCOPES, account=accounts[0])
        if cache.has_state_changed:
            save_cache(cache, config)
    if not result or 'access_token' not in result:
        raise RuntimeError('Microsoft Outlook authorization expired; reconnect the sender account')
    payload = {
        'message': {
            'subject': subject,
            'body': {'contentType': 'Text', 'content': body},
            'toRecipients': [{'emailAddress': {'address': recipient}}],
            'internetMessageHeaders': [{'name': 'X-HokieCare-Delivery-ID', 'value': message_id}],
        },
        'saveToSentItems': True,
    }
    response = requests.post(GRAPH_SEND, headers={
        'Authorization': f"Bearer {result['access_token']}",
        'Content-Type': 'application/json',
    }, json=payload, timeout=20)
    if response.status_code != 202:
        # Microsoft response text can contain account details, so do not include it.
        raise RuntimeError(f'Microsoft Graph send failed with HTTP {response.status_code}')
