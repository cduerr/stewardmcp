# Steward MCP

An MCP server that runs a Claude Code session against a target repo and exposes it as a tool. Other Claude Code instances call `ask` to get answers about the codebase without dumping files into their own context.

> **_Stop being your agents' middleware!_**

Sub-agents share their parent's context budget and cannot communicate with each other. Stewards run in their own session with their own context, scoped to a single repo.

Binding stewards to your repos makes it easy to do tasks like the following without blowing up your context window:

> *"Coordinate with FE and internal apps to identify any endpoints that are
> not in use."*
>
> *"I'm seeing a 400 come back on our auth endpoint. Coordinate with internal services to determine why and offer a solution."*
>
> *"What's the effort required to consolidate all of our Python services on structlog?"*

Stewards are read-only by default but can be given the same tools as any Claude Code session.

## Quick Start

```sh
cd /path/to/target-repo
npx stewardmcp@latest init
npx stewardmcp@latest install
```

Then tell Claude about it in your CLAUDE.md:

> Use the `stewardmcp-<repo-name>` MCP server to ask questions about the \<repo-name\> codebase. Prefer follow-up questions over restating context.

## How it works

Steward spawns a Claude Code Agent SDK session pointed at a repo. On the first question, it warms up by reading the directory structure and CLAUDE.md. Subsequent questions reuse the same session, so the steward builds up context over time. If the session sits idle for longer than the configured timeout, it resets automatically on the next request.

Communication happens over stdio using the MCP protocol. Claude Code spawns the steward as a child process — no ports, no collision between instances.

## Prerequisites

- [Claude Code](https://claude.com/claude-code) installed and working

## Setup

### 1. Initialize the target repo

```sh
cd /path/to/target-repo
npx stewardmcp@latest init
```

This creates a `.stewardmcp/` directory with:
- `config.json` — instance name, idle timeout, allowed tools, warmup prompt
- `ENGINEER.md` — persona instructions for the steward

The instance name is derived from the directory name (e.g. `stewardmcp-billing-api` for a repo at `/projects/billing-api`). If `.gitignore` or `.dockerignore` exist, `.stewardmcp/` is appended automatically.

### 2. Register with Claude Code

```sh
npx stewardmcp@latest install
```

This registers the steward as an MCP server in Claude Code at user scope, so it's available across all your projects.

### 3. Manage instances

```sh
npx stewardmcp@latest list        # Show all registered steward instances
npx stewardmcp@latest uninstall   # Remove this repo's steward from Claude Code
```

## Usage

Once installed, the steward tools are available to any MCP-compatible client. Claude won't call them automatically — you need to tell it the steward exists.

**Claude Code** — add something like this to your CLAUDE.md:

> Use the `stewardmcp-billing-api` MCP server to ask questions (`ask` tool) about the billing-api codebase. Prefer follow-up questions over restating context.

**Other MCP clients** — include similar instructions in your system prompt or conversation.

Replace `stewardmcp-billing-api` with your instance name (shown during `init`).

## Tools

### ask

Send a question to the steward. Returns a text answer.

| Parameter | Type | Description |
|-----------|------|-------------|
| `question` | string | The question to ask |
| `caller` | string | Identifier for who's asking (e.g., "fe", "api") |

The steward reads code, reasons about it, and responds concisely. If the caller changes between requests, the steward is notified of the switch.

Requests are queued — if the steward is busy, the call waits.

### status

Returns the current session state. No parameters.

```json
{
  "state": "idle",
  "currentCaller": "fe",
  "turnCount": 3,
  "idleSeconds": 45,
  "idleTimeoutMinutes": 60,
  "contextPercent": 32
}
```

### clear

Reset the steward session. The next `ask` will start fresh with a new warmup. No parameters.

## Configuration

Edit `.stewardmcp/config.json` in the target repo:

| Field | Default | Description |
|-------|---------|-------------|
| `name` | *(derived from directory)* | Instance name used for MCP registration |
| `idle_timeout_minutes` | `480` | Minutes of inactivity before the session resets |
| `allowed_tools` | `["Read", "Grep", "Glob", "LS"]` | Tools the steward's session can use |
| `warmup_prompt` | *(see defaults)* | Prompt sent on session start to familiarize with the codebase |
| `max_context_characters` | `200000` | Character budget for session context |
| `context_warning_threshold` | `0.6` | Context fraction at which to suggest resetting |
| `log_enabled` | `true` | Write Q&A pairs to `.stewardmcp/log.json` |
| `max_log_entries` | `20` | Maximum entries kept in the log (oldest trimmed) |

The steward's Claude Code session also reads the target repo's `CLAUDE.md` automatically (standard Claude Code behavior). `.stewardmcp/ENGINEER.md` layers on steward-specific behavior via `appendSystemPrompt`.

## Session lifecycle

- **Warmup** happens lazily on the first request, not on server start.
- **Multi-turn** — the session persists across questions. The steward remembers prior context within a session.
- **Config reload** — `config.json` and `ENGINEER.md` are reloaded from disk on every request, so changes take effect immediately. Changes to the target repo's `CLAUDE.md` are picked up on session reset (idle timeout or manual clear).
- **Idle timeout** — if no requests arrive within `idle_timeout_minutes`, the next request triggers a full restart (new session, re-warmup). Each request resets the timer.
- **Manual clear** — call the `clear` tool to force an immediate session reset.
- **Logging** — when `log_enabled` is true, each Q&A exchange is appended to `.stewardmcp/log.json`. The log is capped at `max_log_entries` entries.

## Project structure

```
stewardmcp/
├── src/
│   ├── index.ts      # Entry point — arg routing
│   ├── types.ts      # StewardConfig interface, constants, config loading
│   ├── session.ts    # SessionManager class
│   ├── server.ts     # createMcpServer()
│   ├── commands.ts   # init, install, uninstall, list, help
│   └── serve.ts      # serve command — wires session + server + transport
├── defaults/
│   ├── config.json    # Default configuration
│   └── ENGINEER.md    # Default steward persona
├── package.json
└── tsconfig.json
```

## Development

```sh
npm install
npm run build       # Compile TypeScript
npm run dev         # Watch mode
```

## License

MIT
