<div align="center">

# mailu-mcp

**MCP server to administer a [Mailu](https://mailu.io) mail server from Claude — domains, mailboxes, aliases and forwards, without leaving the conversation.**

[![CI](https://github.com/manganate006/mailu-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/manganate006/mailu-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@manganate06/mailu-mcp)](https://www.npmjs.com/package/@manganate06/mailu-mcp)
[![License: MIT](https://img.shields.io/github/license/manganate006/mailu-mcp)](LICENSE)

**[Installation](#installation) · [Tools](#tools) · [Examples](#examples) · [Limitations](#limitations) · [🇫🇷 Français](README.fr.md)**

</div>

## Overview

This [MCP](https://modelcontextprotocol.io) server exposes Mailu's admin REST API as tools Claude can call. Ask in natural language, Claude executes:

> **You:** List the domains managed by Mailu, then the aliases of `example.com`.
>
> **Claude:** *(calls `mailu_list_domains` then `mailu_list_aliases_by_domain`)*
> 3 domains: `example.com`, `example.org`, `example.net`.
> Aliases of `example.com`: `contact@` → `team@gmail.com`, `info@` → `team@gmail.com`.

## Requirements

Enable the REST API on the Mailu server (`mailu.env`, Mailu ≥ 1.9, tested on 2.0):

```ini
API=true
WEB_API=/api
API_TOKEN=<generate with: openssl rand -hex 32>
```

Then recreate the containers: `cd /mailu && docker compose up -d`.
Verify: `curl -H "Authorization: <API_TOKEN>" https://mail.example.com/api/v1/domain`.

> Auth: the token goes **raw** in the `Authorization` header (apiKey scheme, **no** `Bearer` prefix).

## Installation

### Claude Code

```bash
claude mcp add mailu \
  --env MAILU_API_URL=https://mail.example.com/api/v1 \
  --env MAILU_API_TOKEN=your_token \
  -- npx -y @manganate06/mailu-mcp
```

### Claude Desktop / Cursor

Add to `claude_desktop_config.json` (or Cursor's MCP config):

```json
{
  "mcpServers": {
    "mailu": {
      "command": "npx",
      "args": ["-y", "@manganate06/mailu-mcp"],
      "env": {
        "MAILU_API_URL": "https://mail.example.com/api/v1",
        "MAILU_API_TOKEN": "your_token"
      }
    }
  }
}
```

Tested with Claude Code and Claude Desktop.

## Configuration

| Variable | Purpose | Required | Where to get it |
|---|---|---|---|
| `MAILU_API_URL` | API base URL (with `/api/v1`) | ✅ | your Mailu instance |
| `MAILU_API_TOKEN` | API token | ✅ | `API_TOKEN` in `mailu.env` |
| `MAILU_MCP_DEBUG` | Debug logs on stderr | ❌ | `true` / `false` |

## Tools

32 tools, `mailu_` prefix (omitted in the table). Parameter details: [`src/index.ts`](src/index.ts).

| Area | Tools |
|---|---|
| **Domains** | `list_domains`, `get_domain`, `create_domain`, `update_domain`, `delete_domain`, `generate_domain_dkim`, `list_domain_users`, `list_domain_managers`, `create_domain_manager`, `get_domain_manager`, `delete_domain_manager` |
| **Mailboxes** | `list_users`, `get_user`, `create_user`, `update_user`, `delete_user` |
| **Aliases** | `list_aliases`, `get_alias`, `list_aliases_by_domain`, `create_alias`, `update_alias`, `delete_alias` |
| **Alternatives** | `list_alternatives`, `get_alternative`, `create_alternative`, `delete_alternative` |
| **Relays** | `list_relays`, `get_relay`, `create_relay`, `update_relay`, `delete_relay` |
| **Generic** | `mailu_request` (`method`, `path`, `body`) — escape hatch for any endpoint |

## Examples

- "List the Mailu domains"
- "Show the aliases of `example.com`"
- "Create the mailbox `contact@example.com` with a 2 GB quota"
- "Add an alias `info@example.com` forwarding to `jean@gmail.com`"
- "Regenerate the DKIM keys for `example.com`"

## Limitations

- Mirrors the Mailu admin REST API — anything the API doesn't expose (fetched accounts, webmail/antispam settings…) isn't available; reach any un-wrapped endpoint via `mailu_request`.
- No bulk helpers — one object per call (the assistant can loop over a list).
- `MAILU_API_TOKEN` is a **full-admin** credential — scope it and restrict network access to the API.

## Transport

`stdio` — works with Claude Code, Claude Desktop, Cursor and any MCP client.

## Development

```bash
git clone https://github.com/manganate006/mailu-mcp
cd mailu-mcp && npm install
npm run build && npm run bundle    # dist/bundle.js (single file, e.g. for NFS)
npm test                           # unit tests (mocked HTTP, no live server)
npm run test:integration           # end-to-end CRUD self-test (needs live MAILU_API_URL/TOKEN)
npx @modelcontextprotocol/inspector node dist/bundle.js
```

## License

[MIT](LICENSE)
