<div align="center">

# mailu-mcp

**Serveur MCP pour administrer un serveur mail [Mailu](https://mailu.io) depuis Claude — domaines, boîtes, alias et redirections, sans quitter la conversation.**

[![CI](https://github.com/manganate006/mailu-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/manganate006/mailu-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@manganate06/mailu-mcp)](https://www.npmjs.com/package/@manganate06/mailu-mcp)
[![License: MIT](https://img.shields.io/github/license/manganate006/mailu-mcp)](LICENSE)

**[Installation](#installation) · [Outils](#outils) · [Exemples](#exemples) · [🇬🇧 English](README.en.md)**

</div>

## Aperçu

Ce serveur [MCP](https://modelcontextprotocol.io) expose l'API REST d'administration de Mailu comme des outils que Claude peut appeler. Vous demandez en langage naturel, Claude exécute :

> **Vous :** Liste les domaines gérés par Mailu, puis les alias de `example.com`.
>
> **Claude :** *(appelle `mailu_list_domains` puis `mailu_list_aliases_by_domain`)*
> 3 domaines : `example.com`, `example.org`, `example.net`.
> Alias de `example.com` : `contact@` → `team@gmail.com`, `info@` → `team@gmail.com`.

## Prérequis

Activer l'API REST côté serveur Mailu (`mailu.env`, Mailu ≥ 1.9, testé sur 2.0) :

```ini
API=true
WEB_API=/api
API_TOKEN=<généré via: openssl rand -hex 32>
```

Puis recréer les conteneurs : `cd /mailu && docker compose up -d`.
Vérifier : `curl -H "Authorization: <API_TOKEN>" https://mail.example.com/api/v1/domain`.

> Auth : le token va **brut** dans l'en-tête `Authorization` (schéma apiKey, **sans** préfixe `Bearer`).

## Installation

### Claude Code

```bash
claude mcp add mailu \
  --env MAILU_API_URL=https://mail.example.com/api/v1 \
  --env MAILU_API_TOKEN=votre_token \
  -- npx -y @manganate06/mailu-mcp
```

### Claude Desktop / Cursor

Ajouter à `claude_desktop_config.json` (ou à la config MCP de Cursor) :

```json
{
  "mcpServers": {
    "mailu": {
      "command": "npx",
      "args": ["-y", "@manganate06/mailu-mcp"],
      "env": {
        "MAILU_API_URL": "https://mail.example.com/api/v1",
        "MAILU_API_TOKEN": "votre_token"
      }
    }
  }
}
```

Testé avec Claude Code et Claude Desktop.

## Configuration

| Variable | Rôle | Obligatoire | Où l'obtenir |
|---|---|---|---|
| `MAILU_API_URL` | URL de base de l'API (avec `/api/v1`) | ✅ | votre instance Mailu |
| `MAILU_API_TOKEN` | Token d'API | ✅ | variable `API_TOKEN` de `mailu.env` |
| `MAILU_MCP_DEBUG` | Logs de debug sur stderr | ❌ | `true` / `false` |

## Outils

32 outils, préfixe `mailu_` (omis dans la table). Détail des paramètres : [`src/index.ts`](src/index.ts).

| Domaine | Outils |
|---|---|
| **Domaines** | `list_domains`, `get_domain`, `create_domain`, `update_domain`, `delete_domain`, `generate_domain_dkim`, `list_domain_users`, `list_domain_managers`, `create_domain_manager`, `get_domain_manager`, `delete_domain_manager` |
| **Boîtes** | `list_users`, `get_user`, `create_user`, `update_user`, `delete_user` |
| **Alias** | `list_aliases`, `get_alias`, `list_aliases_by_domain`, `create_alias`, `update_alias`, `delete_alias` |
| **Alternatives** | `list_alternatives`, `get_alternative`, `create_alternative`, `delete_alternative` |
| **Relays** | `list_relays`, `get_relay`, `create_relay`, `update_relay`, `delete_relay` |
| **Générique** | `mailu_request` (`method`, `path`, `body`) — échappatoire pour tout endpoint |

## Exemples

- « Liste les domaines Mailu »
- « Montre les alias de `example.com` »
- « Crée la boîte `contact@example.com` avec un quota de 2 Go »
- « Ajoute un alias `info@example.com` qui redirige vers `jean@gmail.com` »
- « Régénère les clés DKIM de `example.com` »

## Transport

`stdio` — compatible Claude Code, Claude Desktop, Cursor et tout client MCP.

## Développement

```bash
git clone https://github.com/manganate006/mailu-mcp
cd mailu-mcp && npm install
npm run build && npm run bundle    # dist/bundle.js (monolithe, ex. pour NFS)
npm test                           # self-test CRUD (requiert MAILU_API_URL/TOKEN live)
npx @modelcontextprotocol/inspector node dist/bundle.js
```

## Licence

[MIT](LICENSE)
