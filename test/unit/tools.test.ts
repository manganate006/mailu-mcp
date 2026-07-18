import { describe, it, expect } from 'vitest';
import { TOOLS, toJsonSchema } from '../../src/server';

describe('registre des outils', () => {
  it('expose 32 outils', () => {
    expect(TOOLS).toHaveLength(32);
  });

  it('noms uniques, tous prefixes mailu_', () => {
    const names = TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n.startsWith('mailu_')).toBe(true);
  });

  it("inclut l'echappatoire generique mailu_request", () => {
    expect(TOOLS.some((t) => t.name === 'mailu_request')).toBe(true);
  });

  it('couvre les familles CRUD attendues', () => {
    const names = TOOLS.map((t) => t.name);
    for (const n of [
      'mailu_list_domains',
      'mailu_create_domain',
      'mailu_update_domain',
      'mailu_delete_domain',
      'mailu_generate_domain_dkim',
      'mailu_create_user',
      'mailu_update_alias',
      'mailu_delete_relay',
      'mailu_create_alternative',
    ]) {
      expect(names).toContain(n);
    }
  });

  it('chaque schema se convertit en JSON Schema de type object', () => {
    for (const t of TOOLS) {
      const js = toJsonSchema(t.schema);
      expect(js).toBeTypeOf('object');
      expect(js.type).toBe('object');
    }
  });

  it('chaque outil a une description non vide et un handler', () => {
    for (const t of TOOLS) {
      expect(t.description.length).toBeGreaterThan(0);
      expect(typeof t.handler).toBe('function');
    }
  });
});
