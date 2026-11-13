// Static policy lint of SQL text. Catches regressions (missing RLS, anon grants, unsafe
// SECURITY DEFINER) cheaply in CI. It is NOT RLS proof: only the pgTAP suite against a
// real Postgres/Supabase stack demonstrates enforced authorization.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = join(process.cwd(), 'supabase', 'migrations');
const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
const sql = files.map(f => readFileSync(join(dir, f), 'utf8')).join('\n').replace(/--[^\n]*/g, '');
const admissionRpcs = ['issue', 'admit', 'dispatch', 'finish', 'revoke', 'purge', 'retry_check'].map(n => `public.admission_${n}`);

describe('supabase migrations static policy', () => {
  it('has timestamp-ordered migrations', () => {
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(f).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
  });
  it('enables RLS on every public table and revokes anon', () => {
    const tables = [...sql.matchAll(/create table (public\.\w+)/gi)].map(m => m[1]!);
    expect(tables.length).toBeGreaterThan(0);
    for (const t of tables) {
      expect(sql).toMatch(new RegExp(`alter table ${t.replace('.', '\\.')} enable row level security`, 'i'));
      expect(sql).toMatch(new RegExp(`revoke all on table ${t.replace('.', '\\.')} from anon`, 'i'));
    }
  });
  it('never grants anything to anon or public', () => {
    expect(sql).not.toMatch(/grant[^;]*\bto\s+(anon|public)\b/i);
  });
  it('every function pins search_path and revokes default EXECUTE', () => {
    const fns = [...sql.matchAll(/create (?:or replace )?function ([\w.]+)\(([^)]*)\)/gi)];
    expect(fns.length).toBeGreaterThan(0);
    for (const [, name] of fns) {
      const body = sql.slice(sql.indexOf(`function ${name}(`));
      expect(body.slice(0, body.indexOf('$$;'))).toMatch(/set search_path = ''/);
      expect(sql).toMatch(new RegExp(`revoke all on function ${name!.replace('.', '\\.')}\\([^)]*\\) from public`, 'i'));
    }
  });
  it('SECURITY DEFINER is limited to account deletion and the service_role-only admission RPCs', () => {
    const definers = [...sql.matchAll(/create function ([\w.]+)\([^)]*\)[^$]*?security definer/gi)].map(m => m[1]);
    expect(definers).toEqual(['public.delete_my_account', ...admissionRpcs]);
  });
  it('admission RPCs execute only as service_role; admission_private is closed to API roles', () => {
    for (const fn of admissionRpcs) {
      const name = fn.replace('.', '\\.');
      expect(sql).toMatch(new RegExp(`revoke all on function ${name}\\([^)]*\\) from public, anon, authenticated;`, 'i'));
      const grants = [...sql.matchAll(new RegExp(`grant execute on function ${name}\\([^)]*\\) to ([\\w, ]+);`, 'gi'))].map(m => m[1]);
      expect(grants, fn).toEqual(['service_role']);
    }
    expect(sql).toMatch(/revoke all on schema admission_private from anon, authenticated, service_role;/i);
    expect(sql).toMatch(/revoke all on all tables in schema admission_private from anon, authenticated, service_role;/i);
    expect(sql).not.toMatch(/grant[^;]*\bon\s+(?:schema\s+admission_private|(?:table\s+)?admission_private\.)/i);
    const tables = [...sql.matchAll(/create table (admission_private\.\w+)/gi)].map(m => m[1]!);
    expect(tables).toHaveLength(3);
    for (const t of tables) expect(sql).toMatch(new RegExp(`alter table ${t.replace('.', '\\.')} enable row level security`, 'i'));
  });
  it('policies are scoped to authenticated and auth.uid()', () => {
    const policies = [...sql.matchAll(/create policy \w+ on [\w.]+\s+for \w+ to (\w+)\s+(?:using|with check) \(\(select auth\.uid\(\)\) = owner_user_id\)/gi)];
    expect(policies.length).toBe(4);
    for (const p of policies) expect(p[1]).toBe('authenticated');
  });
  it('has no availability_json column and no PDF/blob storage', () => {
    expect(sql).not.toMatch(/availability_json\s+jsonb/i);
    expect(sql).not.toMatch(/\bbytea\b|storage\.objects|storage\.buckets/i);
  });
  it('pgTAP plan count matches the assertions in each suite', () => {
    const testDir = join(process.cwd(), 'supabase', 'tests', 'database');
    for (const f of readdirSync(testDir).filter(n => n.endsWith('.test.sql'))) {
      const text = readFileSync(join(testDir, f), 'utf8');
      const planned = Number(text.match(/select plan\((\d+)\);/)?.[1]);
      const asserted = text.split('\n').filter(l => /^select (ok|is|isnt|throws_ok|is_empty)\(/.test(l)).length;
      expect(asserted, f).toBe(planned);
      expect(text, f).toMatch(/^begin;/m);
      expect(text, f).toMatch(/^rollback;/m);
    }
  });
});
