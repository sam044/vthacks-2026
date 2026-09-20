"""Authorize one personal Outlook sender and save an encrypted MSAL token cache."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))

import msal
from hokiecare import mailer


def main():
    try:
        config = mailer.settings(require_cache=False)
    except (KeyError, ValueError) as error:
        raise SystemExit(f'Configuration error: {error}') from None
    cache = msal.SerializableTokenCache()
    application = msal.PublicClientApplication(
        config['client_id'], authority=mailer.AUTHORITY, token_cache=cache)
    flow = application.initiate_device_flow(scopes=mailer.SCOPES)
    if 'user_code' not in flow:
        raise SystemExit('Microsoft did not start device authorization.')
    print(flow['message'])
    print('HokieCare requests only permission to send mail. It does not request inbox access.')
    result = application.acquire_token_by_device_flow(flow)
    if 'access_token' not in result:
        raise SystemExit(f"Microsoft authorization failed: {result.get('error', 'unknown_error')}")
    accounts = application.get_accounts()
    if len(accounts) != 1:
        raise SystemExit('Expected exactly one connected Outlook account.')
    mailer.save_cache(cache, config)
    print(f'Connected one personal Outlook sender. Encrypted token cache saved to {config["token_cache"]}.')
    print('No inbox-read permission was requested.')


if __name__ == '__main__':
    main()
