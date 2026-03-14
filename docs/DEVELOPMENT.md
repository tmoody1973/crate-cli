# Development

This is the maintainer-oriented guide for working on the repo.

## Workspaces

The repo has two main workspaces:

- root app - the CLI, agent loop, servers, and tests
- `www/` - the Next.js marketing/demo site

## Root App Commands

```bash
npm install
npm run dev
npm run build
npm run typecheck
npm test
```

## Web App Commands

```bash
cd www
npm install
npm run dev
npm run build
npm run lint
```

The web app has its own README at [../www/README.md](../www/README.md).

## Repo Map

- `src/cli.ts` - CLI entrypoint
- `src/mcp-server.ts` - MCP stdio entrypoint
- `src/agent/` - routing, planning, skills, prompt construction
- `src/servers/` - tool servers and activation registries
- `src/ui/` - terminal UI
- `src/utils/` - config, player, scratchpad, DB helpers
- `src/skills/` - query-matched `SKILL.md` workflows
- `tests/` - Vitest suite
- `docs/` - canonical docs, reference docs, plans, archive, marketing
- `www/` - Next.js marketing/demo site

## Documentation Rules

If behavior changes, update the canonical docs instead of editing old drafts:

- install, commands, keys: [CONFIGURATION.md](CONFIGURATION.md)
- MCP behavior: [MCP.md](MCP.md)
- runtime model: [ARCHITECTURE.md](ARCHITECTURE.md)
- product framing: [PRD.md](PRD.md)
- docs navigation: [README.md](README.md)

Historical drafts belong in `docs/archive/`.
Launch collateral belongs in `docs/marketing/`.
Implementation notes belong in `docs/plans/`.

## Change Checklist

When changing runtime behavior:

- update the relevant canonical docs in `docs/`
- update the root [README.md](../README.md) if install or usage changed
- update `www/` copy if marketing claims or product surface changed
- keep `src/servers/index.ts` and `src/servers/tool-registry.ts` aligned

When changing tests:

- avoid production-rate delays inside unit tests
- prefer deterministic mocks over real network access

## Current Improvement Opportunities

- unify the two server registries into one source of truth
- reduce product-claim duplication between README, docs, and website pages
- add lightweight docs linting or a stale-link check in CI
