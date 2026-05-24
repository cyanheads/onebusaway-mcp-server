# Developer Protocol

**Server:** onebusaway-mcp-server
**Version:** 0.1.3
**Package:** [@cyanheads/onebusaway-mcp-server](https://www.npmjs.com/package/@cyanheads/onebusaway-mcp-server)
**Framework:** [@cyanheads/mcp-ts-core](https://www.npmjs.com/package/@cyanheads/mcp-ts-core) `^0.9.7`
**Engines:** Bun ≥1.3.0, Node ≥24.0.0
**MCP SDK:** `@modelcontextprotocol/sdk` ^1.29.0
**Zod:** ^4.4.3

> **Read the framework docs first:** `node_modules/@cyanheads/mcp-ts-core/CLAUDE.md` contains the full API reference — builders, Context, error codes, exports, patterns. This file covers server-specific conventions only.

---

## Core Rules

- **Logic throws, framework catches.** Tool/resource handlers are pure — throw on failure, no `try/catch`. Plain `Error` is fine; the framework catches, classifies, and formats. Use error factories (`notFound()`, `validationError()`, etc.) when the error code matters.
- **Use `ctx.log`** for request-scoped logging. No `console` calls.
- **Use `ctx.state`** for tenant-scoped storage. Never access persistence directly.
- **Check `ctx.elicit` / `ctx.sample`** for presence before calling.
- **Secrets in env vars only** — never hardcoded.

---

## Patterns

### Tool

```ts
import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { getOneBusAwayService } from '@/services/onebusaway/onebusaway-service.js';

export const getStop = tool('onebusaway_get_stop', {
  title: 'Get Stop Details',
  description: 'Fetch details for a specific stop by ID.',
  annotations: { readOnlyHint: true },
  input: z.object({
    stopId: z.string().min(1).describe('Agency-prefixed stop ID (e.g. "1_75403").'),
  }),
  output: z.object({
    id: z.string().describe('Agency-prefixed stop ID.'),
    name: z.string().describe('Stop name.'),
    routeIds: z.array(z.string()).describe('IDs of routes that serve this stop.'),
  }),
  errors: [
    {
      reason: 'stop_not_found',
      code: JsonRpcErrorCode.NotFound,
      when: 'Stop ID does not exist on this instance.',
      recovery: 'Search for the stop with onebusaway_find_stops or onebusaway_search_stops to get a valid ID.',
    },
  ],

  async handler(input, ctx) {
    const stop = await getOneBusAwayService().getStop(input.stopId, ctx);
    ctx.log.info('getStop completed', { stopId: input.stopId });
    return stop;
  },

  format: (result) => [{
    type: 'text',
    text: `## ${result.name}\n**ID:** ${result.id}\n**Routes:** ${result.routeIds.join(', ')}`,
  }],
});
```

### Resource

```ts
import { resource, z } from '@cyanheads/mcp-ts-core';
import { getOneBusAwayService } from '@/services/onebusaway/onebusaway-service.js';

export const stopResource = resource('onebusaway://stop/{stopId}', {
  name: 'onebusaway-stop',
  description: 'Stop metadata — name, coordinates, served routes, and wheelchair accessibility.',
  mimeType: 'application/json',
  params: z.object({ stopId: z.string().describe('Agency-prefixed stop ID.') }),
  async handler(params, ctx) {
    return getOneBusAwayService().getStop(params.stopId, ctx);
  },
});
```

### Server config

```ts
// src/config/server-config.ts
import { z } from '@cyanheads/mcp-ts-core';
import { parseEnvConfig } from '@cyanheads/mcp-ts-core/config';

const ServerConfigSchema = z.object({
  apiKey: z.string().default('TEST').describe('OneBusAway API key.'),
  baseUrl: z.string().default('https://api.pugetsound.onebusaway.org').describe('Base URL.'),
});

let _config: z.infer<typeof ServerConfigSchema> | undefined;
export function getServerConfig() {
  _config ??= parseEnvConfig(ServerConfigSchema, {
    apiKey: 'ONEBUSAWAY_API_KEY',
    baseUrl: 'ONEBUSAWAY_BASE_URL',
  });
  return _config;
}
```

`parseEnvConfig` maps Zod schema paths → env var names so errors name the variable (`ONEBUSAWAY_API_KEY`) not the path (`apiKey`). Throws `ConfigurationError`, which the framework prints as a clean startup banner.

---

## Context

Handlers receive a unified `ctx` object. Key properties:

| Property | Description |
|:---------|:------------|
| `ctx.log` | Request-scoped logger — `.debug()`, `.info()`, `.notice()`, `.warning()`, `.error()`. Auto-correlates requestId, traceId, tenantId. |
| `ctx.state` | Tenant-scoped KV — `.get(key)`, `.set(key, value, { ttl? })`, `.delete(key)`, `.list(prefix, { cursor, limit })`. Accepts any serializable value. |
| `ctx.signal` | `AbortSignal` for cancellation. |
| `ctx.requestId` | Unique request ID. |
| `ctx.tenantId` | Tenant ID from JWT or `'default'` for stdio. |

---

## Errors

Handlers throw — the framework catches, classifies, and formats.

**Recommended: typed error contract.** Declare `errors: [{ reason, code, when, recovery, retryable? }]` on `tool()` / `resource()` to receive `ctx.fail(reason, …)` typed against the reason union. TypeScript catches typos at compile time, `data.reason` is auto-populated for observability, linter enforces conformance against the handler body. `recovery` is required descriptive metadata for the agent's next move (≥ 5 words, lint-validated); for the wire `data.recovery.hint` (mirrored into `content[]` text), pass explicitly at the throw site when dynamic context matters: `ctx.fail('reason', msg, { recovery: { hint: '...' } })`. Baseline codes (`InternalError`, `ServiceUnavailable`, `Timeout`, `ValidationError`, `SerializationError`) bubble freely and don't need declaring.

```ts
errors: [
  { reason: 'no_match', code: JsonRpcErrorCode.NotFound,
    when: 'No item matched the query',
    recovery: 'Broaden the query or check the spelling and try again.' },
],
async handler(input, ctx) {
  const item = await db.find(input.id);
  if (!item) throw ctx.fail('no_match', `No item ${input.id}`);
  return item;
}
```

**Declare contracts inline on each tool.** The contract is part of the tool's public surface — one file should give the full picture. Don't extract a shared `errors[]` constant; per-tool repetition is the intended cost of locality.

**Fallback (no contract entry fits):** throw via factories or plain `Error`.

```ts
// Error factories — explicit code
import { notFound, serviceUnavailable } from '@cyanheads/mcp-ts-core/errors';
throw notFound('Item not found', { itemId });
throw serviceUnavailable('API unavailable', { url }, { cause: err });

// Plain Error — framework auto-classifies from message patterns
throw new Error('Item not found');           // → NotFound
throw new Error('Invalid query format');     // → ValidationError

// McpError — when no factory exists for the code
import { McpError, JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
throw new McpError(JsonRpcErrorCode.DatabaseError, 'Connection failed', { pool: 'primary' });
```

See framework CLAUDE.md and the `api-errors` skill for the full auto-classification table, all available factories, and the contract reference.

---

## Structure

```text
src/
  index.ts                              # createApp() entry point — registers tools/resources, inits service
  config/
    server-config.ts                    # ONEBUSAWAY_API_KEY, ONEBUSAWAY_BASE_URL (Zod schema)
  services/
    onebusaway/
      onebusaway-service.ts             # OneBusAway service — wraps onebusaway-sdk, error classification
      types.ts                          # Domain types (Stop, Route, Arrival, Vehicle, etc.)
  mcp-server/
    tools/definitions/
      list-agencies.tool.ts             # onebusaway_list_agencies
      find-stops.tool.ts                # onebusaway_find_stops
      search-stops.tool.ts              # onebusaway_search_stops
      get-stop.tool.ts                  # onebusaway_get_stop
      find-routes.tool.ts               # onebusaway_find_routes
      search-routes.tool.ts             # onebusaway_search_routes
      get-route.tool.ts                 # onebusaway_get_route
      list-routes-for-agency.tool.ts    # onebusaway_list_routes_for_agency
      get-arrivals.tool.ts              # onebusaway_get_arrivals
      get-trip.tool.ts                  # onebusaway_get_trip
      get-vehicles.tool.ts              # onebusaway_get_vehicles
      get-schedule-for-stop.tool.ts     # onebusaway_get_schedule_for_stop
      get-schedule-for-route.tool.ts    # onebusaway_get_schedule_for_route
    resources/definitions/
      stop.resource.ts                  # onebusaway://stop/{stopId}
      route.resource.ts                 # onebusaway://route/{routeId}
tests/                                  # Vitest tests — 77 tests covering all tools and resources
```

---

## Naming

| What | Convention | Example |
|:-----|:-----------|:--------|
| Files | kebab-case with suffix | `search-docs.tool.ts` |
| Tool/resource/prompt names | snake_case | `search_docs` |
| Directories | kebab-case | `src/services/doc-search/` |
| Descriptions | Single string or template literal, no `+` concatenation | `'Search items by query and filter.'` |

---

## Skills

Skills are modular instructions in `skills/` at the project root. Read them directly when a task matches — e.g., `skills/add-tool/SKILL.md` when adding a tool.

**Agent skill directory:** Copy skills into the directory your agent discovers (Claude Code: `.claude/skills/`, others: equivalent). Skills then load as context without referencing `skills/` paths. After framework updates, run the `maintenance` skill — Phase B re-syncs the agent directory.

Available skills:

| Skill | Purpose |
|:------|:--------|
| `setup` | Post-init project orientation |
| `design-mcp-server` | Design tool surface, resources, and services for a new server |
| `add-tool` | Scaffold a new tool definition |
| `add-app-tool` | Scaffold an MCP App tool + paired UI resource |
| `add-resource` | Scaffold a new resource definition |
| `add-prompt` | Scaffold a new prompt definition |
| `add-service` | Scaffold a new service integration |
| `add-test` | Scaffold test file for a tool, resource, or service |
| `field-test` | Exercise tools/resources/prompts with real inputs, verify behavior, report issues |
| `security-pass` | Audit server for MCP-flavored security gaps: output injection, scope blast radius, input sinks, tenant isolation |
| `devcheck` | Lint, format, typecheck, audit |
| `polish-docs-meta` | Finalize docs, README, metadata, and agent protocol for shipping |
| `maintenance` | Investigate changelogs, adopt upstream changes, sync skills to agent dirs |
| `report-issue-framework` | File a bug or feature request against `@cyanheads/mcp-ts-core` via `gh` CLI |
| `report-issue-local` | File a bug or feature request against this server's own repo via `gh` CLI |
| `api-auth` | Auth modes, scopes, JWT/OAuth |
| `api-canvas` | DataCanvas: register tabular data, run SQL, export, plus the `spillover()` helper for big result sets — Tier 3 opt-in |
| `api-config` | AppConfig, parseConfig, env vars |
| `api-context` | Context interface, logger, state, progress |
| `api-errors` | McpError, JsonRpcErrorCode, error patterns |
| `api-services` | LLM, Speech, Graph services |
| `api-testing` | createMockContext, test patterns |
| `api-utils` | Formatting, parsing, security, pagination, scheduling, telemetry helpers |
| `api-telemetry` | OTel catalog: spans, metrics, completion logs, env config, cardinality rules |
| `api-workers` | Cloudflare Workers runtime |

When you complete a skill's checklist, check the boxes and add a completion timestamp at the end (e.g., `Completed: 2026-03-11`).

---

## Commands

**Runtime:** Scripts use `tsx` — both `npm run <cmd>` and `bun run <cmd>` work. `bun` is slightly faster for script invocation but not required.

| Command | Purpose |
|:--------|:--------|
| `npm run build` | Compile TypeScript |
| `npm run rebuild` | Clean + build |
| `npm run clean` | Remove build artifacts |
| `npm run devcheck` | Lint + format + typecheck + security + changelog sync |
| `bun run audit:refresh` | Delete `bun.lock`, reinstall, re-audit. Use when `devcheck` flags a transitive advisory — stale lockfile can mask already-patched deps. If advisory survives, it's real. |
| `npm run tree` | Generate directory structure doc |
| `npm run format` | Auto-fix formatting |
| `npm test` | Run tests |
| `npm run start:stdio` | Production mode (stdio) |
| `npm run start:http` | Production mode (HTTP) |
| `npm run changelog:build` | Regenerate `CHANGELOG.md` from `changelog/*.md` |
| `npm run changelog:check` | Verify `CHANGELOG.md` is in sync (used by devcheck) |
| `npm run bundle` | Build and pack as `.mcpb` for one-click Claude Desktop install |

---

## Bundling

`npm run bundle` produces a `.mcpb` extension bundle for one-click install in Claude Desktop. MCPB is stdio-only — HTTP and Cloudflare Workers deployments are unaffected. Consumers who don't need it can delete `manifest.json` and `.mcpbignore`; `lint:packaging` skips cleanly.

**Adding an env var requires both files:** `server.json` (registry discovery, `environmentVariables[]`) and `manifest.json` (bundle install UX, `mcp_config.env` + `user_config`). `lint:packaging` (run by `devcheck`) verifies the env var names match.

**README install badges.** Drop these into the project README to give users one-click install paths. Fill in `<OWNER>` / `<REPO>` / `<PACKAGE_NAME>` and encode the per-server config. Cursor + VS Code badges assume the server is published to npm; Claude Desktop downloads the `.mcpb` directly so npm publishing isn't required.

| Client | Mechanism |
|:-------|:----------|
| Claude Desktop | Browser downloads the `.mcpb` from the latest GitHub Release; OS file handler routes it to Claude Desktop, which opens the install dialog. No deep-link URL scheme yet — this is the canonical path. |
| Cursor | Official `https://cursor.com/en/install-mcp` endpoint with base64 JSON config. |
| VS Code / Insiders | Official `vscode:mcp/install?...` deep link, wrapped in `https://vscode.dev/redirect?url=` so GitHub-rendered markdown doesn't strip the non-HTTP scheme. |
| Claude Code / Codex | CLI only (`claude mcp add` / `codex mcp add`); no URL scheme. |

```markdown
[![Install in Claude Desktop](https://img.shields.io/badge/Install_in-Claude_Desktop-D97757?style=for-the-badge&logo=anthropic&logoColor=white)](https://github.com/<OWNER>/<REPO>/releases/latest/download/<PACKAGE_NAME>.mcpb)
[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=<PACKAGE_NAME>&config=<BASE64_CONFIG>)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=for-the-badge&logo=visualstudiocode&logoColor=white)](https://vscode.dev/redirect?url=vscode:mcp/install?<URLENCODED_JSON>)
```

Both install links route through HTTPS endpoints (`cursor.com/en/install-mcp` and `vscode.dev/redirect`) — GitHub-rendered markdown strips non-HTTP URL schemes from anchors, so a raw `cursor://` or `vscode:` link won't click through from github.com.

Generate the encoded configs (replace `<PACKAGE_NAME>` and add env vars for any required API keys):

```bash
# Cursor: base64-encoded JSON. Split command/args, add env when keys are needed.
echo -n '{"command":"npx","args":["-y","<PACKAGE_NAME>"],"env":{"API_KEY":"your-api-key"}}' | base64
# Without env (no required keys):
echo -n '{"command":"npx","args":["-y","<PACKAGE_NAME>"]}' | base64

# VS Code: URL-encoded JSON. Same shape plus a `name` field.
node -p 'encodeURIComponent(JSON.stringify({name:"<SHORT_NAME>",command:"npx",args:["-y","<PACKAGE_NAME>"],env:{API_KEY:"your-api-key"}}))'
# Without env:
node -p 'encodeURIComponent(JSON.stringify({name:"<SHORT_NAME>",command:"npx",args:["-y","<PACKAGE_NAME>"]}))'
```

Both clients use the same `{command, args, env}` shape (matching `mcp.json` schema). VS Code adds a top-level `name` field. Omit `env` entirely when no API keys are needed — don't include empty objects or framework-only vars like `MCP_TRANSPORT_TYPE`.

The Claude Desktop badge requires the bundle to ship with a stable filename — `bun run bundle` outputs `dist/<PACKAGE_NAME>.mcpb`, and `release-and-publish` attaches that file to the GitHub Release. `releases/latest/download/<PACKAGE_NAME>.mcpb` then redirects to the most recent release.

---

## Changelog

Directory-based, grouped by minor series via the `.x` semver-wildcard convention. Source of truth: `changelog/<major.minor>.x/<version>.md` (e.g. `changelog/0.1.x/0.1.0.md`) — one file per release, shipped in the npm package. At release, author the per-version file with a concrete version and date, then run `npm run changelog:build` to regenerate the rollup. `changelog/template.md` is a **pristine format reference** — never edited or moved; read it for the frontmatter + section layout when scaffolding. `CHANGELOG.md` is a **navigation index** (header + link + summary per version), regenerated by `npm run changelog:build` — devcheck hard-fails on drift; never hand-edit it.

Each per-version file opens with YAML frontmatter:

```markdown
---
summary: "One-line headline, ≤350 chars"  # required — powers the rollup index
breaking: false                            # optional — true flags breaking changes
security: false                            # optional — true flags security fixes
---

# 0.1.0 — YYYY-MM-DD
...
```

`breaking: true` renders a `· ⚠️ Breaking` badge — use it when consumers must update code on upgrade (signature changes, removed APIs, config renames). `security: true` renders a `· 🛡️ Security` badge and pairs with a `## Security` body section. When both are set, badges render `· ⚠️ Breaking · 🛡️ Security`.

**Section order** (Keep a Changelog): Added, Changed, Deprecated, Removed, Fixed, Security. Include only sections with entries — don't ship empty headers.

**Tag annotations** render as GitHub Release bodies via `--notes-from-tag`. They must be structured markdown — never a flat comma-separated string. Subject omits the version number (GitHub prepends it). See `changelog/template.md` for the full format reference.

---

## Imports

```ts
// Framework — z is re-exported, no separate zod import needed
import { tool, z } from '@cyanheads/mcp-ts-core';
import { McpError, JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';

// Server's own code — via path alias
import { getMyService } from '@/services/my-domain/my-service.js';
```

---

## Checklist

- [ ] Zod schemas: all fields have `.describe()`, only JSON-Schema-serializable types (no `z.custom()`, `z.date()`, `z.transform()`, `z.bigint()`, `z.symbol()`, `z.void()`, `z.map()`, `z.set()`, `z.function()`, `z.nan()`)
- [ ] Optional nested objects: handler guards for empty inner values from form-based clients (`if (input.obj?.field && ...)`, not just `if (input.obj)`). When regex/length constraints matter, use `z.union([z.literal(''), z.string().regex(...).describe(...)])` — literal variants are exempt from `describe-on-fields`.
- [ ] JSDoc `@fileoverview` + `@module` on every file
- [ ] `ctx.log` for logging, `ctx.state` for storage
- [ ] Handlers throw on failure — error factories or plain `Error`, no try/catch
- [ ] `format()` renders all data the LLM needs — different clients forward different surfaces (Claude Code → `structuredContent`, Claude Desktop → `content[]`); both must carry the same data
- [ ] If wrapping external API: raw/domain/output schemas reviewed against real upstream sparsity/nullability before finalizing required vs optional fields
- [ ] If wrapping external API: normalization and `format()` preserve uncertainty; do not fabricate facts from missing upstream data
- [ ] If wrapping external API: tests include at least one sparse payload case with omitted upstream fields
- [ ] Registered in `createApp()` arrays (directly or via barrel exports)
- [ ] Tests use `createMockContext()` from `@cyanheads/mcp-ts-core/testing`
- [ ] `npm run devcheck` passes
