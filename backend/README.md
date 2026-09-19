# Backend keyed hashing

Branch: `codex/encrypt-user-data`. Scope: **hashing logic only**. The frontend,
frontend dependencies, API routes and Databricks integration are unchanged.

This dependency-free Node.js 22+ module produces deterministic **HMAC-SHA-256**
pseudonyms for identifiers that need equality matching or record linkage. It uses
Node's built-in `node:crypto` implementation; it does not implement cryptographic
primitives itself. There is no decrypt function: original values are not recoverable.

## Run the tests

From the repository root (no additional install needed):

```sh
npm --prefix backend test
```

## Backend usage

```js
import { createUserDataHasherFromEnv } from './src/user-data-hasher.mjs';

// Initialize once in the backend after secrets have been injected.
const hasher = createUserDataHasherFromEnv();

// Example only: schema validation and authenticated request handling belong to
// the future backend. Select exactly which identifiers may be stored.
const protectedFields = hasher.hashFields({
  student_id: 'synthetic-8101',
  pid: 'fake-pid',
});
// Output: { student_id_hash: 'hmac-sha256:v1:k1:<64 hex chars>', pid_hash: '...' }
// Future persistence should write ONLY these hash fields for these identifiers.
// Do not spread the original request alongside them or log its raw values.

const storedToken = protectedFields.student_id_hash;
hasher.verifyValue('student_id', 'synthetic-8101', storedToken); // true
const candidates = hasher.lookupHashes('student_id', 'synthetic-8101');
// Future parameterized SQL can match student_id_hash against candidates.
// Never interpolate user data into SQL or send the secret keys to Databricks.
```

`hashValue(field, value)` returns a single token. `hashFields(record)` returns a new
record containing only `<field>_hash` columns, without modifying the caller's object.
Nulls, undefined, empty strings, numbers and nested values are rejected; no type
coercion or partial output is used. Choose handling for missing optional fields in
the request schema before hashing. Field names must be fixed by server code.

This module isn't wired into a write path yet. It will **not** protect any existing
database writes automatically. The team's existing FastAPI/Python backend and
Databricks/Lakebase connections are unchanged. This Node.js module is a standalone
implementation; Python integration or a compatible Python port is a separate step.

## Configuration and secrets

Provide these environment variables to the backend process, or pass the same
configuration directly to `createUserDataHasher({ activeKeyId, keys, namespace })`:

| Setting | Purpose |
| --- | --- |
| `USER_DATA_HASH_ACTIVE_KEY_ID` | Immutable key version used for new writes, e.g. `k1` |
| `USER_DATA_HASH_KEYS_JSON` | JSON object mapping version IDs to secret base64 keys |
| `USER_DATA_HASH_NAMESPACE` | Stable application/dataset scope; default `hokiecare.user-data` |

Each key must be **32 cryptographically random bytes**, encoded as canonical padded
base64. Provision with your backend secret manager, using a CSPRNG such as
`crypto.randomBytes(32)`. A 32-byte passphrase or repeated-byte string is not a secure
key; length validation cannot measure entropy. The test fixtures deliberately use
public deterministic keys and must never be deployed.

`backend/.env.example` contains invalid placeholders only. The module doesn't load
`.env` files by itself. Configure your process/environment loader or secret manager.
No production keys have been generated, saved or printed by this implementation.

Keep keys in the backend secret manager, separate from database rows and source
control. Never use `NEXT_PUBLIC_` variables, client bundles, request parameters, or
logs for keys. The module captures secret `KeyObject`s and doesn't export them.
Temporary decoded buffers are zeroed; JavaScript environment strings and HMAC input
strings cannot be guaranteed to be erased from process memory.

Errors do not include supplied values or key contents. Missing or malformed keys
stop initialization; there is no development/default key fallback. The package
exports only under the Node condition, and its `node:crypto` dependency also makes
it unsuitable for a browser bundle. Never import it into frontend code.

## Stored format and matching semantics

```text
hmac-sha256:v1:<key-id>:<64 lowercase hexadecimal characters>
```

Store the **entire token** in a STRING column, not only the digest. It includes the
algorithm, format version and key version (none are secrets). Maximum token length
is 144 ASCII characters. The authenticated message is the UTF-8 encoding of this
compact JSON array, in this exact order:

```text
["hmac-sha256","v1",namespace,keyId,field,value]
```

This framing prevents ambiguous concatenation and binds each digest to its field,
key version and application scope. Identical values in different fields/namespaces
produce different tokens. Matching across source systems requires an intentionally
shared field name and namespace. Use separate keys/namespaces for unrelated datasets
or tenants. Do not accept arbitrary caller-selected fields/namespaces on an endpoint.

Values are hashed exactly as provided: there is **no implicit trimming, case folding,
or Unicode normalization**. Decide a stable, field-specific normalization policy
before integration; use it for writes and lookups. Changing normalization later
requires a migration from original values, not from old hashes.

Limits: 64 characters per namespace/field/key ID, 16 KiB UTF-8 per value, 64 fields
per batch, and 16 retained key versions. Verification compares fixed-length digests
using `timingSafeEqual`; this does not make the entire request path constant-time.
Malformed or wrong tokens return false. A well-formed token referencing an unknown
key throws a configuration error instead of silently treating the record as absent.

## Key rotation

1. Generate a fresh random key under a **new version ID**, never overwrite material
   for an existing ID. Add it to all readers/writers while retaining existing keys.
2. Change the active key ID for new writes after all instances know the new key.
3. Use `lookupHashes(field, originalValue)` to query records written under any
   retained version. It returns the active-key token first, then older candidates.
4. If an authorized request supplies the original value again, the future backend
   may replace the old token with the active-key token after matching it.
5. Retire a key only when its records have been migrated/deleted or losing matching
   access is acceptable. Compromised keys require an incident-specific migration.

An old HMAC **cannot be converted into a new HMAC without the original input**.
Rotation changes tokens. Cross-version joins and uniqueness constraints therefore
need a migration/mapping strategy; lookup candidates alone do not solve concurrent
duplicate insertion. Do not claim automatic rehashing, automatic database migration,
or automatic secret rotation. This module provides version support only.

## Boundaries

Keyed hashes are pseudonyms, not anonymous data: equality/frequency remains visible,
and someone holding a key can test guesses. Retain access controls and TLS. Do not
expose an unrestricted hash/verification endpoint. This isn't a password-storage
function, authentication system, or authorization check.

Hash only identifiers that must support equality matching. Hashing clinical text or
every numeric/category field would destroy their usefulness for analytics. Fields
that must later be read in their original form need a separate storage decision.
No clinical text, plaintext identifier backup, or mental-health risk score is stored
by this module.

Reference: [Node.js crypto documentation](https://nodejs.org/docs/latest-v22.x/api/crypto.html).
