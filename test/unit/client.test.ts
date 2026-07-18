import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import nock from 'nock';
import { MailuClient, TOOLS } from '../../src/server';

const HOST = 'http://mailu.test';
const API = '/api/v1';
const TOKEN = 'secret-token-123';

function tool(name: string) {
  const t = TOOLS.find((x) => x.name === name);
  if (!t) throw new Error(`outil introuvable: ${name}`);
  return t;
}

/** Invoque un outil comme le ferait le serveur : parse Zod puis handler. */
async function call(name: string, args: Record<string, unknown> = {}) {
  const client = new MailuClient(`${HOST}${API}`, TOKEN);
  const t = tool(name);
  return t.handler(client, t.schema.parse(args));
}

beforeAll(() => nock.disableNetConnect());
afterAll(() => nock.enableNetConnect());
afterEach(() => nock.cleanAll());

describe('MailuClient — auth & requetes HTTP (mockees)', () => {
  it('envoie le token BRUT dans l en-tete Authorization (pas de Bearer)', async () => {
    const scope = nock(HOST, { reqheaders: { authorization: TOKEN } })
      .get(`${API}/domain`)
      .reply(200, [{ name: 'example.com' }]);

    const data = await call('mailu_list_domains');
    expect(data).toEqual([{ name: 'example.com' }]);
    expect(scope.isDone()).toBe(true); // l en-tete a bien matche
  });

  it('URL-encode les identifiants dans le chemin', async () => {
    nock(HOST).get(`${API}/user/a%2Bb%40ex.com`).reply(200, { email: 'a+b@ex.com' });
    const data = await call('mailu_get_user', { email: 'a+b@ex.com' });
    expect(data.email).toBe('a+b@ex.com');
  });

  it('POST envoie le corps pour une creation', async () => {
    nock(HOST)
      .post(`${API}/alias`, { email: 'c@ex.com', destination: ['x@gmail.com'] })
      .reply(201, { email: 'c@ex.com' });
    const data = await call('mailu_create_alias', { email: 'c@ex.com', destination: ['x@gmail.com'] });
    expect(data.email).toBe('c@ex.com');
  });

  it('PATCH retire l identifiant du corps en update', async () => {
    nock(HOST)
      .patch(`${API}/domain/ex.com`, (body) => !('domain' in body) && body.comment === 'maj')
      .reply(200, { name: 'ex.com', comment: 'maj' });
    const data = await call('mailu_update_domain', { domain: 'ex.com', comment: 'maj' });
    expect(data.comment).toBe('maj');
  });

  it('leve une erreur d auth explicite sur 401', async () => {
    nock(HOST).get(`${API}/domain`).reply(401, { message: 'bad token' });
    await expect(call('mailu_list_domains')).rejects.toThrow(/MAILU_API_TOKEN/);
  });

  it('remonte le code HTTP sur les autres erreurs (404)', async () => {
    nock(HOST).get(`${API}/domain/none.com`).reply(404, { message: 'not found' });
    await expect(call('mailu_get_domain', { domain: 'none.com' })).rejects.toThrow(/404/);
  });

  it('mailu_request transmet method/path/body tels quels', async () => {
    nock(HOST).delete(`${API}/relay/r1`).reply(200, { ok: true });
    const data = await call('mailu_request', { method: 'DELETE', path: '/relay/r1' });
    expect(data.ok).toBe(true);
  });

  it('rejette un argument invalide via le schema Zod', async () => {
    // mailu_create_user exige email + raw_password
    await expect(call('mailu_create_user', { email: 'x@ex.com' })).rejects.toBeTruthy();
  });
});
