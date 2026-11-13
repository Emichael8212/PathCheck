import { describe, expect, it } from 'vitest';
import { parsePublicSupabaseConfig } from '../../src/persistence/config';

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const fakeJwt = (role: string) => `${b64url({ alg: 'HS256' })}.${b64url({ role, iss: 'supabase' })}.synthetic-signature`;

describe('public Supabase configuration (no secret in browser)', () => {
  it('accepts publishable and legacy anon keys over https', () => {
    expect(parsePublicSupabaseConfig({ url: 'https://abc.supabase.co', publishableKey: 'sb_publishable_abc123' })).toEqual({ ok: true, value: { url: 'https://abc.supabase.co', publishableKey: 'sb_publishable_abc123' } });
    expect(parsePublicSupabaseConfig({ url: 'https://abc.supabase.co/', publishableKey: fakeJwt('anon') }).ok).toBe(true);
  });
  it('allows plain http only for loopback test stacks', () => {
    expect(parsePublicSupabaseConfig({ url: 'http://127.0.0.1:54321', publishableKey: 'sb_publishable_x' }).ok).toBe(true);
    expect(parsePublicSupabaseConfig({ url: 'http://abc.supabase.co', publishableKey: 'sb_publishable_x' })).toMatchObject({ ok: false, reasonCode: 'insecure_supabase_url' });
  });
  it('fails closed on secret and service-role keys without echoing them', () => {
    for (const key of ['sb_secret_abcdef', fakeJwt('service_role'), fakeJwt('supabase_admin')]) {
      const r = parsePublicSupabaseConfig({ url: 'https://abc.supabase.co', publishableKey: key });
      expect(r).toEqual({ ok: false, code: 'forbidden', reasonCode: 'secret_key_in_browser' });
      expect(JSON.stringify(r)).not.toContain(key);
    }
  });
  it('rejects missing, malformed or path/credential-bearing configuration', () => {
    expect(parsePublicSupabaseConfig({ url: undefined, publishableKey: undefined })).toMatchObject({ ok: false, code: 'unavailable' });
    expect(parsePublicSupabaseConfig({ url: '', publishableKey: 'sb_publishable_x' })).toMatchObject({ ok: false, code: 'unavailable' });
    expect(parsePublicSupabaseConfig({ url: 'not a url', publishableKey: 'sb_publishable_x' }).ok).toBe(false);
    expect(parsePublicSupabaseConfig({ url: 'https://u:p@abc.supabase.co', publishableKey: 'sb_publishable_x' }).ok).toBe(false);
    expect(parsePublicSupabaseConfig({ url: 'https://abc.supabase.co/rest/v1', publishableKey: 'sb_publishable_x' }).ok).toBe(false);
    expect(parsePublicSupabaseConfig({ url: 'https://abc.supabase.co', publishableKey: 'random-string' })).toMatchObject({ ok: false, reasonCode: 'unrecognized_publishable_key' });
  });
});
