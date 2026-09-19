# Team workflow

Accept the GitHub invitation, then clone:

```powershell
git clone https://github.com/sam044/vthacks-2026.git
cd vthacks-2026
git switch -c codex/your-feature
```

Keep `main` usable for the demo. Use short feature branches and pull requests; coordinate ownership before editing the same files. There are no application install or run commands yet.

The agent handles implementation, integration, tests, and deployment. Suggested human workstreams are user interviews and sponsor clarification, campus data validation, usability testing, and the pitch/demo. These are suggestions, not assignments to particular teammates.

Record outside libraries, AI assistance, datasets, and original contributions in the submission. Label synthetic events and sample student scenarios clearly. Do not upload student records or shared account secrets. Keep keys in local ignored configuration and hosting secret settings.

Before merging, describe the change and how it was checked. Once application code exists, add the relevant build, routing, data, and integration checks to CI.
