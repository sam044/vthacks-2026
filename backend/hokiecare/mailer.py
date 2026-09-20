"""SMTP transport. Credentials stay server-side; no message content is logged."""
from email.message import EmailMessage
import os
import smtplib
import ssl
from urllib.parse import urlsplit


def settings():
    if os.environ.get('HOKIECARE_EMAIL_ENABLED', '').lower() != 'true':
        raise ValueError('Email is disabled')
    host = os.environ['SMTP_HOST']
    sender = os.environ['SMTP_FROM']
    origin = os.environ['HOKIECARE_PUBLIC_ORIGIN'].rstrip('/')
    parsed = urlsplit(origin)
    local = parsed.scheme == 'http' and parsed.hostname in ('localhost', '127.0.0.1')
    if not host or '@' not in sender or '\r' in sender or '\n' in sender:
        raise ValueError('Invalid SMTP settings')
    if (parsed.scheme != 'https' and not local) or not parsed.netloc or parsed.path or parsed.query or parsed.fragment or parsed.username:
        raise ValueError('Invalid public origin')
    security = os.environ.get('SMTP_SECURITY', 'starttls')
    if security not in ('starttls', 'tls'):
        raise ValueError('SMTP requires TLS')
    user, password = os.environ.get('SMTP_USERNAME'), os.environ.get('SMTP_PASSWORD')
    if bool(user) != bool(password):
        raise ValueError('Incomplete SMTP credentials')
    return dict(host=host, sender=sender, origin=origin, security=security,
                port=int(os.environ.get('SMTP_PORT', '465' if security == 'tls' else '587')),
                user=user, password=password)


def ready():
    try:
        settings()
        return True
    except (KeyError, ValueError):
        return False


def send(recipient, subject, body, message_id):
    config = settings()
    message = EmailMessage()
    message['From'] = config['sender']
    message['To'] = recipient
    message['Subject'] = subject
    message['Message-ID'] = f'<{message_id}@hokiecare.notifications>'
    message.set_content(body)
    context = ssl.create_default_context()
    if config['security'] == 'tls':
        connection = smtplib.SMTP_SSL(config['host'], config['port'], timeout=20, context=context)
    else:
        connection = smtplib.SMTP(config['host'], config['port'], timeout=20)
    with connection as smtp:
        if config['security'] == 'starttls':
            smtp.ehlo()
            smtp.starttls(context=context)
            smtp.ehlo()
        if config['user']:
            smtp.login(config['user'], config['password'])
        if smtp.send_message(message):
            raise smtplib.SMTPException('Recipient refused')
