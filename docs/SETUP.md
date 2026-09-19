# Accounts and access

The agent will implement, test, configure, and deploy the project once the required accounts are available. Account creation, sign-in, MFA, accepting terms, and entering billing details belong to the account owner. Signing into a site does not automatically give the terminal/API access; verify each connection with a small authenticated operation.

## Current HokieCare setup

| Service | Your action | Agent's next step |
| --- | --- | --- |
| GitHub | All three teammates already have verified write access to [sam044/vthacks-2026](https://github.com/sam044/vthacks-2026) | Authentication already verified; maintain code and collaboration setup |
| Databricks | Existing profile `sam` explicitly selected; OAuth access verified. No new signup needed | Verify SQL/inference, import core data, create a scoped Genie agent, and check hosted OAuth identity. [Setup details](DATABRICKS_SETUP.md) |
| Railway | Sign into [Railway](https://railway.com/) with GitHub; authorize this repository when connecting it; account owner handles billing | Deploy one React/FastAPI container with public HTTPS and server-side Databricks credentials |
| Devpost + event Discord | All four teammates join [VTHacks 14](https://vthacks-14.devpost.com/); obtain the current sponsor briefs and workspace link | Prepare the submission, evidence, and demo materials |

The current workspace's exact edition/billing has not been established. If it is Free Edition, quotas and outbound restrictions apply. Locally fetched public snapshots can be uploaded through the Files API. Verify external SQL authentication early; display cached fallback as a dated snapshot. [Current limitations](https://docs.databricks.com/aws/en/getting-started/free-edition-limitations)

Databricks browser-based CLI OAuth is working. Deployment needs its own supported, scoped OAuth service principal; do not copy a local user token cache onto the server. Check this before the first hosted integration. No separate Google AI Studio, MongoDB, Vultr or AWS signup is required for the initial plan. [OAuth setup](https://docs.databricks.com/aws/en/dev-tools/auth/oauth-u2m)

## Only if we pursue these extensions

| Service | Action |
| --- | --- |
| GoDaddy ANS/domain | Sign into [GoDaddy Developers](https://developer.godaddy.com/); get sponsor API access and control of a domain's DNS. Confirm eligibility before buying anything specifically for the prize. |
| ElevenLabs | Sign into [ElevenLabs](https://elevenlabs.io/) and obtain an API key if spoken plans are included. |
| HokieAI / Cloudforce | Obtain the exact sponsor-provided sign-in and publishing link. It was not verified from public search; do not assume any similarly named portal is the right one. |

No separate Azure, AWS, MongoDB, Supabase, or paid map account is required by the proposed MVP. Map rendering and tile-source licensing will be checked during implementation.

## Secrets and cost

Put keys in the ignored `.env` file or directly into the host's secret settings. Never paste them into issues, README files, screenshots, or the submission. `.env.example` lists only proposed variable names. Browser login alone is not a completed API connection.

Paid services are acceptable per the user's request, but this setup phase provisions no paid infrastructure. Start with event credits and small resource sizes. Before provisioning, record the actual plan and price shown by the provider. Avoid GPU servers, Kubernetes, and a new paid database for this MVP. Server billing can continue after shutdown; destroy unwanted resources when appropriate. [Vultr billing](https://docs.vultr.com/support/platform/billing/how-am-i-billed-for-my-servers)
