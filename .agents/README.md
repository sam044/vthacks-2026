# Project Databricks skills

This directory contains all 31 stable skills from [databricks/databricks-agent-skills](https://github.com/databricks/databricks-agent-skills), installed for this project's Databricks development. Upstream commit and file hashes are in [databricks-skills.lock.json](databricks-skills.lock.json).

The skill files are unmodified upstream material. Their use and redistribution are subject to the [Databricks License](DATABRICKS_LICENSE) and [NOTICE](DATABRICKS_NOTICE); they are not relicensed under the application project's license. They are included solely for developing with or connecting to Databricks Services.

Upstream whitespace is preserved so hashes remain reproducible. Run project whitespace checks excluding `.agents/skills/**`; do not normalize vendor files just to clear style warnings. Git attributes preserve their bytes and mark them as vendored for review.

Codex discovers project skills under `skills/<name>/SKILL.md`. Read only those relevant to the current task. Installation does not activate an MCP server, authenticate a workspace, or authorize cloud operations. The user selected profile `sam` for this project; see [verified setup](../docs/DATABRICKS_SETUP.md) and the [implementation plan](../docs/IMPLEMENTATION_PLAN.md).

Do not bulk-rewrite imported skill files or follow their examples as commands without checking task scope and actual CLI/API support. Higher-priority session/user instructions govern project work. Preserve this pin during the hackathon; update deliberately with a reviewed upstream diff and refreshed hashes afterwards.
