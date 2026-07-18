# CLAUDE.md — mailu-mcp

Serveur MCP enveloppant l'API REST admin de **Mailu** (`/api/v1`). Stack et conventions alignées sur les autres MCP de `/mnt/GIT/_mcp` (cf. `nginx-proxy-manager-mcp`).

## Architecture

Un seul fichier : `src/index.ts`
- **`Logger`** — logs sur stderr, activés par `MAILU_MCP_DEBUG=true`.
- **`MailuClient`** — instance axios (`baseURL` = `MAILU_API_URL`, header `Authorization: <token>` brut). Méthode unique `req(method, path, data?)` : renvoie `res.data` sur 2xx, sinon lève une `Error` formatée depuis le corps JSON Mailu (message/error/code). `validateStatus: () => true` pour formater nous-mêmes les 4xx.
- **`TOOLS`** — tableau déclaratif `{ name, description, schema (Zod), handler }`. Ajouter un outil = ajouter une entrée. Les schémas Zod sont convertis en JSON Schema via `zodToJsonSchema`.
- **`MailuMCPServer`** — enregistre `ListTools` (map de `TOOLS`) et `CallTool` (parse Zod puis dispatch vers `handler`). Erreurs renvoyées en `{ isError: true }`.

## Auth Mailu (important)

Schéma `apiKey` : le token va **brut** dans l'en-tête `Authorization` (PAS `Bearer <token>`). Confirmé via `securityDefinitions` du swagger. Token statique, pas de flux login/expiry (contrairement à NPM).

## Endpoints réels (Mailu 2.0)

`/domain` (GET/POST), `/domain/{d}` (GET/PATCH/DELETE), `/domain/{d}/dkim` (POST),
`/domain/{d}/manager[/{email}]`, `/domain/{d}/users` (GET),
`/user` (GET/POST), `/user/{email}` (GET/PATCH/DELETE),
`/alias` (GET/POST), `/alias/{alias}` (GET/PATCH/DELETE), `/alias/destination/{domain}` (GET),
`/alternative` (GET/POST), `/alternative/{alt}` (GET/DELETE),
`/relay` (GET/POST), `/relay/{name}` (GET/PATCH/DELETE).

> ⚠️ Pas de ressource `/token` dans cette version. Les identifiants de chemin (emails/domaines) sont encodés via `encodeURIComponent`.

## Commandes

```bash
npm install
npm run build         # tsc
npm run bundle        # esbuild -> dist/bundle.js (utilisé dans .mcp.json)
npm run dev           # tsx (dev)

# Test hors-ligne (liste les outils) :
MAILU_API_URL=... MAILU_API_TOKEN=... \
  npx @modelcontextprotocol/inspector node dist/bundle.js
```

## Configuration

Cible : `MAILU_API_URL` (ex. `https://mail.example.com/api/v1`), Mailu 2.0. L'API REST doit être activée côté serveur dans `mailu.env` (`API=true`, `WEB_API=/api`, `API_TOKEN=...`) puis `docker compose up -d`. Voir le README pour le détail.
