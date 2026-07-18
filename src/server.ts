/**
 * Mailu MCP server — logique (sans effet de bord au chargement).
 * -------------------------------------------------------------
 * Wraps the Mailu admin REST API (/api/v1) so that Claude can administer a
 * self-hosted Mailu mail server: domains, users, aliases, alternatives, relays
 * and domain managers/DKIM.
 *
 * Auth: Mailu expects the raw API token in the `Authorization` header
 * (apiKey scheme, NOT `Bearer <token>`). Configured server-side via API_TOKEN.
 *
 * Le point d'entree executable est src/index.ts (il importe et lance ce module).
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import axios, { AxiosInstance } from 'axios';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// ---------------------------------------------------------------------------
// Logger (enabled with MAILU_MCP_DEBUG=true, writes to stderr only)
// ---------------------------------------------------------------------------
class Logger {
  private enabled: boolean;
  constructor() {
    this.enabled = process.env.MAILU_MCP_DEBUG === 'true';
  }
  log(message: string, data?: any) {
    if (!this.enabled) return;
    console.error(`[MAILU-MCP] ${new Date().toISOString()} - ${message}`);
    if (data !== undefined) console.error(JSON.stringify(data, null, 2));
  }
  error(message: string, error?: any) {
    console.error(`[MAILU-MCP ERROR] ${new Date().toISOString()} - ${message}`);
    if (error) console.error(error?.stack || error);
  }
}
const logger = new Logger();

// ---------------------------------------------------------------------------
// HTTP client for the Mailu REST API
// ---------------------------------------------------------------------------
export class MailuClient {
  private axios: AxiosInstance;

  constructor(baseUrl: string, token: string) {
    // Normalise: strip trailing slash so path joins are predictable.
    const baseURL = baseUrl.replace(/\/+$/, '');
    this.axios = axios.create({
      baseURL,
      headers: {
        // Mailu apiKey scheme: raw token in Authorization (no "Bearer" prefix)
        Authorization: token,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
      // Mailu returns JSON error bodies with 4xx; let us format them ourselves.
      validateStatus: () => true,
    });
  }

  /** Low-level request. Returns parsed data or throws a formatted Error. */
  async req(method: string, path: string, data?: unknown): Promise<any> {
    const url = path.startsWith('/') ? path : `/${path}`;
    logger.log(`${method.toUpperCase()} ${url}`, data);
    const res = await this.axios.request({ method, url, data });
    logger.log(`<- ${res.status} ${url}`);
    if (res.status >= 200 && res.status < 300) {
      return res.data;
    }
    // Build a helpful error message from the Mailu response body.
    const body = res.data;
    let detail: string;
    if (body && typeof body === 'object') {
      detail = body.message || body.error || body.code || JSON.stringify(body);
    } else {
      detail = String(body ?? '');
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Auth refuse (HTTP ${res.status}) : verifiez MAILU_API_TOKEN et que API=true cote serveur. ${detail}`
      );
    }
    throw new Error(`Mailu API ${res.status} sur ${method.toUpperCase()} ${url}: ${detail}`);
  }

  // Path segment encoder for identifiers (emails, domains, names).
  static seg(v: string): string {
    return encodeURIComponent(v);
  }
}

// ---------------------------------------------------------------------------
// Zod input schemas (converted to JSON Schema for MCP tool declarations)
// ---------------------------------------------------------------------------
const Empty = z.object({});

// Domains
const DomainCreate = z.object({
  name: z.string().describe('Nom de domaine, ex: example.com'),
  comment: z.string().optional(),
  max_users: z.number().int().optional().describe('-1 = illimite'),
  max_aliases: z.number().int().optional().describe('-1 = illimite'),
  max_quota_bytes: z.number().int().optional(),
  signup_enabled: z.boolean().optional(),
  alternatives: z.array(z.string()).optional().describe('Domaines alternatifs'),
});
const DomainName = z.object({ domain: z.string().describe('Nom de domaine') });
const DomainUpdate = z.object({
  domain: z.string().describe('Nom de domaine a modifier'),
  comment: z.string().optional(),
  max_users: z.number().int().optional(),
  max_aliases: z.number().int().optional(),
  max_quota_bytes: z.number().int().optional(),
  signup_enabled: z.boolean().optional(),
  alternatives: z.array(z.string()).optional(),
});
const DomainManagerCreate = z.object({
  domain: z.string().describe('Nom de domaine'),
  user_email: z.string().describe('Email de l utilisateur a nommer gestionnaire'),
});
const DomainManagerRef = z.object({
  domain: z.string().describe('Nom de domaine'),
  email: z.string().describe('Email du gestionnaire'),
});

// Users
const userBody = {
  comment: z.string().optional(),
  quota_bytes: z.number().int().optional(),
  global_admin: z.boolean().optional(),
  enabled: z.boolean().optional(),
  enable_imap: z.boolean().optional(),
  enable_pop: z.boolean().optional(),
  allow_spoofing: z.boolean().optional(),
  forward_enabled: z.boolean().optional(),
  forward_destination: z.array(z.string()).optional(),
  forward_keep: z.boolean().optional(),
  reply_enabled: z.boolean().optional(),
  reply_subject: z.string().optional(),
  reply_body: z.string().optional(),
  reply_startdate: z.string().optional().describe('Format YYYY-MM-DD'),
  reply_enddate: z.string().optional().describe('Format YYYY-MM-DD'),
  displayed_name: z.string().optional(),
  spam_enabled: z.boolean().optional(),
  spam_mark_as_read: z.boolean().optional(),
  spam_threshold: z.number().int().optional(),
};
const UserCreate = z.object({
  email: z.string().describe('Adresse email complete, ex: user@example.com'),
  raw_password: z.string().describe('Mot de passe en clair (sera hache par Mailu)'),
  ...userBody,
});
const UserEmail = z.object({ email: z.string().describe('Adresse email de la boite') });
const UserUpdate = z.object({
  email: z.string().describe('Adresse email a modifier'),
  raw_password: z.string().optional().describe('Nouveau mot de passe en clair'),
  ...userBody,
});

// Aliases
const AliasCreate = z.object({
  email: z.string().describe('Adresse de l alias, ex: contact@example.com'),
  destination: z.array(z.string()).describe('Destinations de redirection'),
  comment: z.string().optional(),
  wildcard: z.boolean().optional(),
});
const AliasRef = z.object({ alias: z.string().describe('Adresse email de l alias') });
const AliasUpdate = z.object({
  alias: z.string().describe('Adresse email de l alias a modifier'),
  destination: z.array(z.string()).optional(),
  comment: z.string().optional(),
  wildcard: z.boolean().optional(),
});
const AliasByDomain = z.object({
  domain: z.string().describe('Domaine dont on liste les alias par destination'),
});

// Alternatives
const AlternativeCreate = z.object({
  name: z.string().describe('Domaine alternatif, ex: alt.example.com'),
  domain: z.string().describe('Domaine principal auquel il est rattache'),
});
const AlternativeRef = z.object({ alt: z.string().describe('Domaine alternatif') });

// Relays
const RelayCreate = z.object({
  name: z.string().describe('Nom du relay (domaine relaye)'),
  smtp: z.string().optional().describe('Hote SMTP cible'),
  comment: z.string().optional(),
});
const RelayRef = z.object({ name: z.string().describe('Nom du relay') });
const RelayUpdate = z.object({
  name: z.string().describe('Nom du relay a modifier'),
  smtp: z.string().optional(),
  comment: z.string().optional(),
});

// Generic escape hatch
const GenericRequest = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).describe('Methode HTTP'),
  path: z.string().describe('Chemin relatif a /api/v1, ex: /domain/example.com'),
  body: z.any().optional().describe('Corps JSON (pour POST/PUT/PATCH)'),
});

// ---------------------------------------------------------------------------
// Tool registry
// ---------------------------------------------------------------------------
type Handler = (client: MailuClient, args: any) => Promise<any>;

export interface ToolDef {
  name: string;
  description: string;
  schema: z.ZodType<any>;
  handler: Handler;
}

const S = MailuClient.seg;

export const TOOLS: ToolDef[] = [
  // ---- Domains ----
  {
    name: 'mailu_list_domains',
    description: 'Liste tous les domaines mail geres par Mailu.',
    schema: Empty,
    handler: (c) => c.req('GET', '/domain'),
  },
  {
    name: 'mailu_get_domain',
    description: 'Details d un domaine (quotas, alternatives, alias...).',
    schema: DomainName,
    handler: (c, a) => c.req('GET', `/domain/${S(a.domain)}`),
  },
  {
    name: 'mailu_create_domain',
    description: 'Cree un nouveau domaine mail.',
    schema: DomainCreate,
    handler: (c, a) => c.req('POST', '/domain', a),
  },
  {
    name: 'mailu_update_domain',
    description: 'Met a jour un domaine existant (quotas, commentaire, signup...).',
    schema: DomainUpdate,
    handler: (c, a) => {
      const { domain, ...body } = a;
      return c.req('PATCH', `/domain/${S(domain)}`, body);
    },
  },
  {
    name: 'mailu_delete_domain',
    description: 'Supprime un domaine (et ses boites/alias). Irreversible.',
    schema: DomainName,
    handler: (c, a) => c.req('DELETE', `/domain/${S(a.domain)}`),
  },
  {
    name: 'mailu_generate_domain_dkim',
    description: 'Genere (ou regenere) les cles DKIM/DMARC d un domaine.',
    schema: DomainName,
    handler: (c, a) => c.req('POST', `/domain/${S(a.domain)}/dkim`),
  },
  {
    name: 'mailu_list_domain_users',
    description: 'Liste les boites (users) d un domaine.',
    schema: DomainName,
    handler: (c, a) => c.req('GET', `/domain/${S(a.domain)}/users`),
  },
  {
    name: 'mailu_list_domain_managers',
    description: 'Liste les gestionnaires (managers) d un domaine.',
    schema: DomainName,
    handler: (c, a) => c.req('GET', `/domain/${S(a.domain)}/manager`),
  },
  {
    name: 'mailu_create_domain_manager',
    description: 'Nomme un utilisateur gestionnaire d un domaine.',
    schema: DomainManagerCreate,
    handler: (c, a) => c.req('POST', `/domain/${S(a.domain)}/manager`, { user_email: a.user_email }),
  },
  {
    name: 'mailu_get_domain_manager',
    description: 'Verifie si un email est gestionnaire d un domaine.',
    schema: DomainManagerRef,
    handler: (c, a) => c.req('GET', `/domain/${S(a.domain)}/manager/${S(a.email)}`),
  },
  {
    name: 'mailu_delete_domain_manager',
    description: 'Retire le role de gestionnaire d un domaine a un email.',
    schema: DomainManagerRef,
    handler: (c, a) => c.req('DELETE', `/domain/${S(a.domain)}/manager/${S(a.email)}`),
  },

  // ---- Users ----
  {
    name: 'mailu_list_users',
    description: 'Liste toutes les boites mail (users), tous domaines confondus.',
    schema: Empty,
    handler: (c) => c.req('GET', '/user'),
  },
  {
    name: 'mailu_get_user',
    description: 'Details d une boite mail par son adresse.',
    schema: UserEmail,
    handler: (c, a) => c.req('GET', `/user/${S(a.email)}`),
  },
  {
    name: 'mailu_create_user',
    description: 'Cree une boite mail (email + mot de passe + options).',
    schema: UserCreate,
    handler: (c, a) => c.req('POST', '/user', a),
  },
  {
    name: 'mailu_update_user',
    description: 'Met a jour une boite mail (mot de passe, quota, forward, reponse auto...).',
    schema: UserUpdate,
    handler: (c, a) => {
      const { email, ...body } = a;
      return c.req('PATCH', `/user/${S(email)}`, body);
    },
  },
  {
    name: 'mailu_delete_user',
    description: 'Supprime une boite mail. Irreversible.',
    schema: UserEmail,
    handler: (c, a) => c.req('DELETE', `/user/${S(a.email)}`),
  },

  // ---- Aliases ----
  {
    name: 'mailu_list_aliases',
    description: 'Liste tous les alias (redirections), tous domaines confondus.',
    schema: Empty,
    handler: (c) => c.req('GET', '/alias'),
  },
  {
    name: 'mailu_get_alias',
    description: 'Details d un alias par son adresse.',
    schema: AliasRef,
    handler: (c, a) => c.req('GET', `/alias/${S(a.alias)}`),
  },
  {
    name: 'mailu_list_aliases_by_domain',
    description: 'Liste les alias dont une destination appartient au domaine donne.',
    schema: AliasByDomain,
    handler: (c, a) => c.req('GET', `/alias/destination/${S(a.domain)}`),
  },
  {
    name: 'mailu_create_alias',
    description: 'Cree un alias (redirection vers une ou plusieurs destinations).',
    schema: AliasCreate,
    handler: (c, a) => c.req('POST', '/alias', a),
  },
  {
    name: 'mailu_update_alias',
    description: 'Met a jour un alias (destinations, wildcard, commentaire).',
    schema: AliasUpdate,
    handler: (c, a) => {
      const { alias, ...body } = a;
      return c.req('PATCH', `/alias/${S(alias)}`, body);
    },
  },
  {
    name: 'mailu_delete_alias',
    description: 'Supprime un alias.',
    schema: AliasRef,
    handler: (c, a) => c.req('DELETE', `/alias/${S(a.alias)}`),
  },

  // ---- Alternatives ----
  {
    name: 'mailu_list_alternatives',
    description: 'Liste tous les domaines alternatifs.',
    schema: Empty,
    handler: (c) => c.req('GET', '/alternative'),
  },
  {
    name: 'mailu_get_alternative',
    description: 'Details d un domaine alternatif.',
    schema: AlternativeRef,
    handler: (c, a) => c.req('GET', `/alternative/${S(a.alt)}`),
  },
  {
    name: 'mailu_create_alternative',
    description: 'Ajoute un domaine alternatif rattache a un domaine principal.',
    schema: AlternativeCreate,
    handler: (c, a) => c.req('POST', '/alternative', a),
  },
  {
    name: 'mailu_delete_alternative',
    description: 'Supprime un domaine alternatif.',
    schema: AlternativeRef,
    handler: (c, a) => c.req('DELETE', `/alternative/${S(a.alt)}`),
  },

  // ---- Relays ----
  {
    name: 'mailu_list_relays',
    description: 'Liste tous les relays (domaines relayes).',
    schema: Empty,
    handler: (c) => c.req('GET', '/relay'),
  },
  {
    name: 'mailu_get_relay',
    description: 'Details d un relay par son nom.',
    schema: RelayRef,
    handler: (c, a) => c.req('GET', `/relay/${S(a.name)}`),
  },
  {
    name: 'mailu_create_relay',
    description: 'Cree un relay (domaine relaye vers un SMTP cible).',
    schema: RelayCreate,
    handler: (c, a) => c.req('POST', '/relay', a),
  },
  {
    name: 'mailu_update_relay',
    description: 'Met a jour un relay (hote SMTP, commentaire).',
    schema: RelayUpdate,
    handler: (c, a) => {
      const { name, ...body } = a;
      return c.req('PATCH', `/relay/${S(name)}`, body);
    },
  },
  {
    name: 'mailu_delete_relay',
    description: 'Supprime un relay.',
    schema: RelayRef,
    handler: (c, a) => c.req('DELETE', `/relay/${S(a.name)}`),
  },

  // ---- Generic escape hatch ----
  {
    name: 'mailu_request',
    description:
      'Appel generique a l API Mailu (echappatoire pour tout endpoint non couvert). ' +
      'Fournir method, path (relatif a /api/v1) et body optionnel.',
    schema: GenericRequest,
    handler: (c, a) => c.req(a.method, a.path, a.body),
  },
];

/** Convertit un schema Zod en JSON Schema (objet) pour la declaration MCP. */
export function toJsonSchema(schema: z.ZodType<any>): any {
  const js: any = zodToJsonSchema(schema, { $refStrategy: 'none' });
  if (typeof js === 'object' && js !== null && !('type' in js)) {
    return { ...js, type: 'object' };
  }
  return js;
}

// ---------------------------------------------------------------------------
// MCP server
// ---------------------------------------------------------------------------
export class MailuMCPServer {
  private server: Server;
  private client: MailuClient;

  constructor() {
    this.server = new Server(
      { name: 'mailu-mcp', version: '1.0.2' },
      { capabilities: { tools: {} } }
    );

    const baseUrl = process.env.MAILU_API_URL || 'https://localhost/api/v1';
    const token = process.env.MAILU_API_TOKEN || '';
    if (!token) {
      logger.error('MAILU_API_TOKEN manquant : les appels echoueront (401).');
    }
    logger.log(`Init MailuClient sur ${baseUrl}`);
    this.client = new MailuClient(baseUrl, token);

    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: toJsonSchema(t.schema),
      })),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: rawArgs } = request.params;
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) {
        return { content: [{ type: 'text', text: `Outil inconnu: ${name}` }], isError: true };
      }
      try {
        const args = tool.schema.parse(rawArgs ?? {});
        const data = await tool.handler(this.client, args);
        return {
          content: [
            { type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) },
          ],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`Echec outil ${name}`, error);
        return { content: [{ type: 'text', text: JSON.stringify({ error: msg }, null, 2) }], isError: true };
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.log('Server started');
    console.error('Mailu MCP server v1.0.2 running on stdio');
  }
}
