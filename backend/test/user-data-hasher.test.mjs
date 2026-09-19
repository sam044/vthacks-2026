import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { createUserDataHasher, createUserDataHasherFromEnv } from '../src/user-data-hasher.mjs';

// Public deterministic fixtures for tests ONLY. Never use these as deployment keys.
const k1 = Buffer.from(Array.from({ length: 32 }, (_, i) => i)).toString('base64');
const k2 = Buffer.alloc(32, 0xab).toString('base64');
const make = (overrides = {}) => createUserDataHasher({ activeKeyId: 'k1', keys: { k1 }, ...overrides });

test('matches an independent .NET HMAC-SHA256 known-answer fixture', () => {
  // Key: bytes 00..1f. UTF-8 message:
  // ["hmac-sha256","v1","hokiecare.user-data","k1","student_id","synthetic-8101"]
  // Expected digest independently generated with System.Security.Cryptography.HMACSHA256.
  assert.equal(make().hashValue('student_id', 'synthetic-8101'),
    'hmac-sha256:v1:k1:b1ee8190205f458cb959ae6177d4775fa4443ad4fc5ded9d91e90fcda8b5bc4b');
});

test('hashes deterministically into a versioned token with a full SHA-256 digest', () => {
  const hasher = make();
  const hash = hasher.hashValue('student_id', 'synthetic-8101');
  assert.match(hash, /^hmac-sha256:v1:k1:[0-9a-f]{64}$/);
  assert.equal(hash, hasher.hashValue('student_id', 'synthetic-8101'));
  assert.equal(hasher.verifyValue('student_id', 'synthetic-8101', hash), true);
  assert.equal(hasher.verifyValue('student_id', 'synthetic-8102', hash), false);
  assert.equal(hash.includes('synthetic-8101'), false);
});

test('different fields and namespaces cannot share or substitute hashes', () => {
  const hasher = make();
  const hash = hasher.hashValue('student_id', 'same-value');
  assert.notEqual(hash, hasher.hashValue('pid', 'same-value'));
  assert.equal(hasher.verifyValue('pid', 'same-value', hash), false);
  assert.equal(make({ namespace: 'other-project' }).verifyValue('student_id', 'same-value', hash), false);
});

test('field/value boundaries cannot collide through delimiter injection', () => {
  const hasher = make();
  assert.notEqual(hasher.hashValue('ab', 'c'), hasher.hashValue('a', 'bc'));
  const value = 'x", "pid", "y\n\u0000';
  assert.equal(hasher.verifyValue('student_id', value, hasher.hashValue('student_id', value)), true);
});

test('preserves case, whitespace, and Unicode without silently merging identifiers', () => {
  const values = ['Student', 'student', ' student', 'student ', 'é', 'e\u0301', '\ud800', '\ufffd', '学生'];
  const hashes = values.map(value => make().hashValue('id', value));
  assert.equal(new Set(hashes).size, values.length);
});

test('bulk helper returns only hash columns without mutating its input', () => {
  const input = Object.freeze({ student_id: 'synthetic-8101', pid: 'fake-pid' });
  const result = make().hashFields(input);
  assert.deepEqual(Object.keys(result).sort(), ['pid_hash', 'student_id_hash']);
  assert.equal(result.student_id_hash, make().hashValue('student_id', input.student_id));
  assert.equal(JSON.stringify(result).includes(input.pid), false);
  assert.equal(JSON.stringify(result).includes(input.student_id), false);
  assert.equal(input.pid, 'fake-pid');
});

test('rotation writes new tokens and retains old-key verification and lookup', () => {
  const old = make().hashValue('student_id', 'synthetic-8101');
  const rotated = make({ activeKeyId: 'k2', keys: { k1, k2 } });
  const current = rotated.hashValue('student_id', 'synthetic-8101');
  assert.notEqual(current, old);
  assert.match(current, /^hmac-sha256:v1:k2:/);
  assert.equal(rotated.verifyValue('student_id', 'synthetic-8101', old), true);
  assert.deepEqual(rotated.lookupHashes('student_id', 'synthetic-8101'), [current, old]);
});

test('key IDs are bound to the digest, even if two IDs accidentally share a key', () => {
  const hasher = make({ keys: { k1, k2: k1 } });
  const relabeled = hasher.hashValue('id', 'x').replace(':k1:', ':k2:');
  assert.equal(hasher.verifyValue('id', 'x', relabeled), false);
});

test('wrong key material fails verification', () => {
  const token = make().hashValue('id', 'x');
  assert.equal(make({ keys: { k1: k2 } }).verifyValue('id', 'x', token), false);
});

test('missing historical key fails closed with a configuration error', () => {
  const token = make().hashValue('id', 'x');
  const retired = make({ activeKeyId: 'k2', keys: { k2 } });
  assert.throws(() => retired.verifyValue('id', 'x', token), /unavailable HMAC key version/);
  assert.equal(retired.lookupHashes('id', 'x').length, 1);
});

test('rejects malformed, truncated, unsupported, and tampered tokens', () => {
  const hasher = make();
  const token = hasher.hashValue('id', 'x');
  const tampered = token.slice(0, -1) + (token.endsWith('0') ? '1' : '0');
  for (const candidate of [null, undefined, 12, '', token.slice(0, -1), token + '0', token.replace(':v1:', ':v2:'), token.toUpperCase(), tampered, 'x'.repeat(145)]) {
    assert.equal(hasher.verifyValue('id', 'x', candidate), false);
  }
});

test('supports the longest permitted key ID in stored tokens', () => {
  const id = 'k'.repeat(64);
  const hasher = make({ activeKeyId: id, keys: { [id]: k1 } });
  const token = hasher.hashValue('id', 'value');
  assert.equal(token.length, 144);
  assert.equal(hasher.verifyValue('id', 'value', token), true);
});

test('rejects missing or invalid configuration instead of falling back to a key', () => {
  for (const config of [undefined, null, [], {}, { activeKeyId: 'k1', keys: {} }, { activeKeyId: 'missing', keys: { k1 } }, { activeKeyId: 'bad:key', keys: { k1 } }, { activeKeyId: 'k1', keys: { k1 }, namespace: '' }]) {
    assert.throws(() => createUserDataHasher(config));
  }
});

test('rejects malformed base64 and keys of the wrong length without exposing secrets', () => {
  for (const key of ['secret-never-print', k1 + '\n', k1.slice(0, -1), Buffer.alloc(31).toString('base64'), Buffer.alloc(33).toString('base64'), null, 123]) {
    assert.throws(() => make({ keys: { k1: key } }), error => {
      assert.match(error.message, /32 bytes in canonical base64/);
      assert.equal(error.message.includes(String(key)), false);
      return true;
    });
  }
  const noncanonical = k1.slice(0, -2) + '9='; // Different padding bits decoding to the same bytes.
  assert.throws(() => make({ keys: { k1: noncanonical } }), /canonical base64/);
});

test('validates every historical key and bounds the keyring size', () => {
  assert.throws(() => make({ keys: { k1, old: 'invalid' } }));
  assert.throws(() => make({ keys: Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`k${i}`, k1])) }));
});

test('caller mutation cannot change an initialized keyring', () => {
  const keys = { k1 };
  const hasher = make({ keys });
  const token = hasher.hashValue('id', 'x');
  keys.k1 = k2;
  assert.equal(hasher.hashValue('id', 'x'), token);
  assert.equal(Object.isFrozen(hasher), true);
});

test('rejects invalid values without coercion or plaintext in errors', () => {
  for (const value of ['', null, undefined, 123, {}, [], false, 'private'.repeat(3000)]) {
    assert.throws(() => make().hashValue('id', value), /Value must be a non-empty string/);
  }
  for (const field of ['', 'field:injection', 'a'.repeat(65), null]) {
    assert.throws(() => make().hashValue(field, 'private'), /Field must be/);
  }
  assert.doesNotThrow(() => make().hashValue('id', 'x'.repeat(16384)));
  assert.throws(() => make().hashValue('id', 'é'.repeat(8193)), /16384 UTF-8 bytes/);
});

test('bulk helper rejects incomplete and nested records instead of forwarding plaintext', () => {
  for (const fields of [null, [], {}, { id: 'valid', profile: { name: 'private' } }, { id: 'valid', missing: undefined }, Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`f${i}`, 'x']))]) {
    assert.throws(() => make().hashFields(fields));
  }
});

test('environment loader requires explicit secrets and sanitizes parse errors', () => {
  const env = { USER_DATA_HASH_ACTIVE_KEY_ID: 'k1', USER_DATA_HASH_KEYS_JSON: JSON.stringify({ k1 }) };
  assert.equal(createUserDataHasherFromEnv(env).hashValue('id', 'x'), make().hashValue('id', 'x'));
  assert.throws(() => createUserDataHasherFromEnv({}), /USER_DATA_HASH_KEYS_JSON/);
  assert.throws(() => createUserDataHasherFromEnv({ ...env, USER_DATA_HASH_ACTIVE_KEY_ID: undefined }));
  assert.throws(() => createUserDataHasherFromEnv({ ...env, USER_DATA_HASH_KEYS_JSON: '{"key":"secret-invalid-json' }), error => {
    assert.equal(error.message, 'USER_DATA_HASH_KEYS_JSON must be valid JSON.');
    return true;
  });
  for (const raw of ['null', '[]', '"secret"', 'x'.repeat(4097)]) {
    assert.throws(() => createUserDataHasherFromEnv({ ...env, USER_DATA_HASH_KEYS_JSON: raw }));
  }
});

test('default loader works with the actual Node process.env object', () => {
  const moduleUrl = new URL('../src/user-data-hasher.mjs', import.meta.url).href;
  const script = `import {createUserDataHasherFromEnv} from ${JSON.stringify(moduleUrl)}; createUserDataHasherFromEnv().hashValue('id','x');`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, USER_DATA_HASH_ACTIVE_KEY_ID: 'k1', USER_DATA_HASH_KEYS_JSON: JSON.stringify({ k1 }), USER_DATA_HASH_NAMESPACE: 'hokiecare.user-data' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
});
