import { createHmac, createSecretKey, timingSafeEqual } from 'node:crypto';

// Intentionally Node-only. Never import this module into frontend code.
const ALGORITHM = 'hmac-sha256';
const VERSION = 'v1';
const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/;
const TOKEN = /^hmac-sha256:v1:([a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}):([a-f0-9]{64})$/;
const MAX_VALUE_BYTES = 16_384;
const MAX_FIELDS = 64;
const MAX_KEYS = 16;

function isRecord(value) {
  return value !== null && typeof value === 'object'
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function validateIdentifier(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) {
    throw new TypeError(`${label} must be a non-empty identifier of at most 64 characters.`);
  }
}

function validateValue(field, value) {
  validateIdentifier(field, 'Field');
  if (typeof value !== 'string' || value.length === 0 || Buffer.byteLength(value, 'utf8') > MAX_VALUE_BYTES) {
    // Do not put field values or key material in errors or logs.
    throw new TypeError('Value must be a non-empty string of at most 16384 UTF-8 bytes.');
  }
}

function decodeKey(encoded) {
  // Buffer.from alone is permissive: require canonical, padded base64.
  if (typeof encoded !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) {
    throw new TypeError('Each HMAC key must be exactly 32 bytes in canonical base64.');
  }
  const bytes = Buffer.from(encoded, 'base64');
  try {
    if (bytes.length !== 32 || bytes.toString('base64') !== encoded) {
      throw new TypeError('Each HMAC key must be exactly 32 bytes in canonical base64.');
    }
    return createSecretKey(bytes);
  } finally {
    bytes.fill(0);
  }
}

/**
 * Deterministic, one-way pseudonyms for backend matching and record linkage.
 * Not encryption, password hashing, authorization, or anonymization.
 *
 * @param {{activeKeyId: string, keys: Record<string, string>, namespace?: string}} config
 * Keys are immutable version IDs mapped to secret, random 32-byte base64 keys.
 * Namespace and field names are trusted backend configuration, not user input.
 */
export function createUserDataHasher(config) {
  if (!isRecord(config)) throw new TypeError('Hash configuration is required.');
  const { activeKeyId, keys, namespace = 'hokiecare.user-data' } = config;
  validateIdentifier(activeKeyId, 'Active key ID');
  validateIdentifier(namespace, 'Namespace');
  if (!isRecord(keys)) throw new TypeError('A versioned HMAC keyring is required.');

  const entries = Object.entries(keys);
  if (entries.length === 0 || entries.length > MAX_KEYS) {
    throw new TypeError('The HMAC keyring must contain between 1 and 16 keys.');
  }
  const keyring = new Map();
  for (const [keyId, encoded] of entries) {
    validateIdentifier(keyId, 'Key ID');
    keyring.set(keyId, decodeKey(encoded));
  }
  if (!keyring.has(activeKeyId)) throw new Error('Active HMAC key is missing from the keyring.');
  const orderedKeyIds = [activeKeyId, ...keyring.keys()].filter((id, index, all) => all.indexOf(id) === index);

  function digest(keyId, field, value) {
    // JSON array framing prevents delimiter ambiguity. Version, key ID, namespace,
    // and field are authenticated so tokens cannot be relabeled across contexts.
    const payload = JSON.stringify([ALGORITHM, VERSION, namespace, keyId, field, value]);
    return createHmac('sha256', keyring.get(keyId)).update(payload, 'utf8').digest();
  }

  function tokenFor(keyId, field, value) {
    return `${ALGORITHM}:${VERSION}:${keyId}:${digest(keyId, field, value).toString('hex')}`;
  }

  /** Hash the exact string using the current write key. No implicit normalization. */
  function hashValue(field, value) {
    validateValue(field, value);
    return tokenFor(activeKeyId, field, value);
  }

  /**
   * Produce only hash columns, with no plaintext spread or pass-through.
   * Caller must explicitly select sensitive fields before calling this helper.
   * @param {Record<string, string>} fields Flat mapping of field names to values.
   * @returns {Record<string, string>} e.g. { student_id_hash: "hmac-sha256:v1:..." }
   */
  function hashFields(fields) {
    if (!isRecord(fields)) throw new TypeError('Fields must be a flat object of strings.');
    const fieldEntries = Object.entries(fields);
    if (fieldEntries.length === 0 || fieldEntries.length > MAX_FIELDS) {
      throw new TypeError('Provide between 1 and 64 fields to hash.');
    }
    // Validate the entire record before computing any output.
    for (const [field, value] of fieldEntries) validateValue(field, value);
    return Object.fromEntries(fieldEntries.map(([field, value]) => [`${field}_hash`, hashValue(field, value)]));
  }

  /**
   * Compare an original candidate with a stored token using its retained key.
   * Malformed/unsupported tokens return false; a missing historical key throws
   * so configuration loss isn't silently mistaken for an absent record.
   */
  function verifyValue(field, value, storedToken) {
    validateValue(field, value);
    if (typeof storedToken !== 'string' || storedToken.length > 144) return false;
    const match = TOKEN.exec(storedToken);
    if (!match) return false;
    const [, keyId, storedHex] = match;
    if (!keyring.has(keyId)) throw new Error('Stored hash requires an unavailable HMAC key version.');
    return timingSafeEqual(digest(keyId, field, value), Buffer.from(storedHex, 'hex'));
  }

  /**
   * Tokens for a parameterized database lookup across active and retained keys.
   * Never generates a new digest from an old digest. Original input is required.
   */
  function lookupHashes(field, value) {
    validateValue(field, value);
    return orderedKeyIds.map(keyId => tokenFor(keyId, field, value));
  }

  return Object.freeze({ hashValue, hashFields, verifyValue, lookupHashes });
}

/** Load backend-only configuration supplied by a secret manager or environment. */
export function createUserDataHasherFromEnv(env = process.env) {
  // process.env has a special prototype in Node; injected test/config records do not.
  if (env !== process.env && !isRecord(env)) throw new TypeError('Backend environment configuration is required.');
  const serializedKeys = env.USER_DATA_HASH_KEYS_JSON;
  if (typeof serializedKeys !== 'string' || serializedKeys.length === 0 || serializedKeys.length > 4096) {
    throw new Error('USER_DATA_HASH_KEYS_JSON must contain a versioned keyring.');
  }
  let keys;
  try {
    keys = JSON.parse(serializedKeys);
  } catch {
    // Avoid JSON.parse errors, which can contain snippets of secret input.
    throw new Error('USER_DATA_HASH_KEYS_JSON must be valid JSON.');
  }
  return createUserDataHasher({
    activeKeyId: env.USER_DATA_HASH_ACTIVE_KEY_ID,
    keys,
    namespace: env.USER_DATA_HASH_NAMESPACE ?? 'hokiecare.user-data',
  });
}
