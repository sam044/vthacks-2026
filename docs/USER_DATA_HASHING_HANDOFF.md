# Keyed user-data hashing handover

Branch: `codex/encrypt-user-data`.

The user authorized backend hashing logic only, with no frontend changes. After
clarifying that hashes cannot be decrypted, they selected HMAC-SHA-256 for equality
matching and record linkage. API/database integration is explicitly deferred.

The module was developed in a separate, uncommitted Next.js prototype workspace.
Only the hashing package was brought into a clean checkout of the team's current
`main`; none of that prototype's frontend, dependencies, or account model is included.

## Delivered

* `backend/src/user-data-hasher.mjs`: dependency-free Node.js HMAC implementation.
* `backend/test/user-data-hasher.test.mjs`: 20 tests, including an independent .NET
  known-answer result, rotation, tamper rejection, context separation and validation.
* `backend/package.json`: standalone Node-only package and test command.
* `backend/.env.example`: invalid secret placeholders, never production credentials.
* `backend/README.md`: complete usage and rotation contract.
* CI runs `npm --prefix backend test` using its existing Node setup.

Local test command passed all 20 cases in this team-repository checkout. This does
not claim hosted integration, full-repository CI success, or an external security audit.

## Contract

Tokens are `hmac-sha256:v1:<key-id>:<64 lowercase hex characters>`. Persist the full
token. `hashFields()` returns only suffixed hash columns, without original values.
The secret is a random 32-byte key provided by backend-only secret configuration.
Field name, namespace, key ID and format version are included in the authenticated
input. Values are exact strings, without automatic case/whitespace normalization.

New writes use the active key. Retained versions permit checking and looking up
original input against historical tokens. An existing hash cannot be converted to
a new key without the original value. Plan cross-version joins and uniqueness
before integrating rotation. Hashing is pseudonymisation, not anonymisation,
password storage or authorization. Keep credentials separate from stored hashes.

## Integration still required

The team's application uses Python/FastAPI. This standalone Node.js package does
not run in its write path, and this branch adds no Node service or deployment.
A subsequent authorized task must decide between a compatible Python port and
another explicit integration design. A Python port should preserve the documented
JSON framing and validate Unicode/escaping behavior with shared cross-language
test vectors before existing hashes are exchanged.

Select the exact identifier fields and normalization rules, add authentication and
authorization appropriate to real data, provision keys, and exclude plaintext from
database columns and logs. Never hash analytical measures or clinical text merely
because this helper accepts strings. No real student data or clinical records were
used in these tests. No deployed data has been migrated or rehashed.
