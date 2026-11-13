// Public AcademicService surface and engine purity (no model/network/clock/randomness).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AcademicService } from '../../src/contracts';
import { ENGINE_VERSION, academicService } from '../../src/engine';
import { catalog, course, reqCourse, scenario } from '../fixtures/engine/synthetic';

const sourceFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? sourceFiles(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []);

describe('engine purity', () => {
  it.each(['src/engine', 'src/catalog'])('%s reads no clock, network, randomness, storage or framework', dir => {
    for (const f of sourceFiles(dir)) {
      const code = readFileSync(f, 'utf8').split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
      expect(code, f).not.toMatch(/Date\.now|new Date\(|performance\.now|Math\.random|crypto\.randomUUID|fetch\(|XMLHttpRequest|localStorage|sessionStorage|setTimeout|setInterval/);
      const imports = [...code.matchAll(/from '([^']+)'/g)].map(m => m[1]!);
      for (const spec of imports) expect(spec, f).toMatch(/^(\.\/|\.\.\/contracts|\.\.\/catalog|\.\.\/\.\.\/docs\/curriculum\/|@noble\/hashes|zod)/);
    }
  });
});

describe('AcademicService facade', () => {
  it('implements every frozen method and routes through validated inputs', () => {
    const methods: Array<keyof AcademicService> = ['listCatalogs', 'loadValidatedCatalog', 'normalizeAttempts', 'audit', 'evaluate', 'preview', 'validateCandidate', 'generateDraft'];
    for (const m of methods) expect(typeof academicService[m]).toBe('function');
    expect(ENGINE_VERSION).toBe('pathcheck-engine-v1');
    const s = scenario(catalog([course('TEST-101')], [reqCourse('r', 'TEST-101')]));
    const a = academicService.audit(s);
    expect(a.ok && a.value.totalStatus).toBe('unmet');
    expect(academicService.preview({ ...s, engineVersion: 'x' }, { baseFingerprint: 'scenario-v1:sha256:' + '0'.repeat(64), operations: [{ kind: 'remove', placementId: 'p' }] } as never)).toMatchObject({ ok: false, reasonCode: 'unsupported_engine_version' });
    const refs = academicService.listCatalogs();
    expect(refs.ok && refs.value.length).toBe(2);
  });
  it('malformed input returns typed failures, never throws or fabricates analysis', () => {
    expect(academicService.evaluate(null as never)).toMatchObject({ ok: false, code: 'validation_error' });
    expect(academicService.generateDraft({} as never)).toMatchObject({ ok: false, code: 'validation_error' });
    expect(academicService.validateCandidate(null as never, null as never)).toMatchObject({ ok: false });
  });
});
