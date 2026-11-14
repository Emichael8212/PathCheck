// Opt-in actual container tests. No Google/DB/services are started or modified.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDeflate } from 'node:zlib';
import { Readable } from 'node:stream';
import { createDockerPdfInspector, ISOLATION_LIMITS } from '../../supabase/functions/extract-transcript/isolation/dockerInspector';
import type { IsolationEvidence } from '../../supabase/functions/extract-transcript/isolation/dockerInspector';
import { generatedPdf, objectPdf } from '../fixtures/transcripts/pdf';
import { createTranscriptHandler } from '../../supabase/functions/extract-transcript/handler';
import { createGuestAdmission } from '../../supabase/functions/extract-transcript/admission';
import { sha256, sign } from '../../supabase/functions/extract-transcript/crypto';
import { context, eligibility, issue, secret, storeDouble, time } from '../fixtures/transcripts/server';
import { vi } from 'vitest';

const enabled = process.env.PATHCHECK_PDF_ISOLATION_LIVE === '1';
const docker = (args: string[]) => execFileSync('docker', ['--context', 'colima-pathcheck-test', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000 }).trim();
const bytes = (mode: string) => new TextEncoder().encode(`%PDF-${mode}`);
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const evidence: IsolationEvidence[] = [];
let image = ''; let probe = '';
let measuredCpuMicros = 0;
const inspect = (id: string) => createDockerPdfInspector({ imageId: id, onEvidence: e => evidence.push(e) });
function checkClean(e: IsolationEvidence) {
  expect(e.cleanupConfirmed).toBe(true);
  expect(docker(['ps', '-a', '--filter', `name=^/${e.containerName}$`, '--format', '{{.Names}}'])).toBe('');
  console.log(JSON.stringify({ syntheticOnly: true, ...e, containerName: 'disposable-parser-redacted' }));
}
async function runningContainer() {
  for (let i = 0; i < 100; i++) {
    const names = docker(['ps', '--filter', 'label=pathcheck.pdf-isolation=local-v1', '--format', '{{.Names}}']);
    if (names) return names.split('\n')[0]!;
    await delay(30);
  }
  throw new Error('parser_did_not_start');
}
describe.skipIf(!enabled)('LIVE isolated parser containers (synthetic input only)', () => {
  afterAll(async () => {
    await writeFile('/private/tmp/pathcheck-pdf-isolation-evidence.json', JSON.stringify({ image, probe, limits: ISOLATION_LIMITS,
      measuredCpuMicros, evidence }, null, 2), { mode: 0o600 });
  });
  beforeAll(async () => {
    image = docker(['image', 'inspect', 'pathcheck-pdf-parser:local-v1', '--format', '{{.Id}}']);
    const build = await mkdtemp(join(tmpdir(), 'pathcheck-pdf-probes-'));
    try {
      await writeFile(join(build, 'Dockerfile'), await readFile('supabase/functions/extract-transcript/isolation/Dockerfile'));
      // Separate TEST image; never bundled into the actual parser. Probes exercise
      // kernel limits with CPU loops/native allocation, not mocked resource outcomes.
      await writeFile(join(build, 'parser.mjs'), `
import { writeFileSync, readFileSync } from 'node:fs';
let mode=''; for await (const part of process.stdin) mode+=part.toString();
if(mode==='%PDF-CPU') { for(;;){} }
if(mode==='%PDF-MEM') { const held=[]; for(;;)held.push(Buffer.alloc(16*1024*1024,97)); }
if(mode==='%PDF-WALL') { await new Promise(()=>{setInterval(()=>{},1000)}); }
if(mode==='%PDF-OUTPUT') { process.stdout.write('x'.repeat(2048)); await new Promise(()=>{setInterval(()=>{},1000)}); }
if(mode==='%PDF-GUARDS') {
 let disk=false,network=false; try{writeFileSync('/tmp/SYNTHETIC_PDF_MARKER','no')}catch{disk=true}
 try{await fetch('http://192.0.2.1:9',{signal:AbortSignal.timeout(500)})}catch{network=true}
 const secrets=['GEMINI_API_KEY','SUPABASE_SERVICE_ROLE_KEY','PATHCHECK_LOCAL_ROLE_KEY'].some(k=>process.env[k]);
 const max=readFileSync('/sys/fs/cgroup/memory.max','utf8').trim();
 const swap=readFileSync('/sys/fs/cgroup/memory.swap.max','utf8').trim();
 const safe=disk&&network&&!secrets&&max==='268435456'&&swap==='0';
 process.stdout.write(JSON.stringify({ok:true,value:{pageCount:safe?1:99}}));
}
`);
      docker(['build', '--network=none', '--pull=false', '-q', '-t', 'pathcheck-pdf-probes:test-v1', build]);
      probe = docker(['image', 'inspect', 'pathcheck-pdf-probes:test-v1', '--format', '{{.Id}}']);
    } finally { await rm(build, { recursive: true, force: true }); }
  }, 30000);

  it('accepts actual 20-page PDF at exactly the 10MiB envelope; rejects 21 pages/oversize', async () => {
    const objects = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${Array.from({ length: 20 }, (_, i) => `${i + 3} 0 R`).join(' ')}] /Count 20 >>`, ...Array.from({ length: 20 }, () => '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>')];
    let padding = 10 * 1024 * 1024 - 3000; let pdf: Uint8Array = new Uint8Array();
    for (let i = 0; i < 4; i++) { pdf = objectPdf([...objects, `<< /Length ${padding} >>\nstream\n${' '.repeat(padding)}\nendstream`]); padding += 10 * 1024 * 1024 - pdf.length; }
    expect(pdf.length).toBe(10 * 1024 * 1024);
    const inspector = inspect(image);
    expect(await inspector.inspect(pdf)).toEqual({ ok: true, value: { pageCount: 20 } }); checkClean(evidence.at(-1)!);
    expect(await inspector.inspect(await generatedPdf(21))).toMatchObject({ ok: false, reasonCode: 'pdf_page_limit' }); checkClean(evidence.at(-1)!);
    expect(await inspector.inspect(new Uint8Array(10 * 1024 * 1024 + 1))).toMatchObject({ ok: false, reasonCode: 'pdf_size_limit' });
  }, 30000);

  it('enforces native-allocation cgroup memory and swap ceiling', async () => {
    expect(await inspect(probe).inspect(bytes('MEM'))).toMatchObject({ ok: false });
    const e = evidence.at(-1)!; expect(e.oomKilled).toBe(true); expect(e.elapsedMs).toBeLessThan(15000); checkClean(e);
  }, 20000);

  it('enforces actual CPU budget and throttling, then removes the killed worker', async () => {
    const task = inspect(probe).inspect(bytes('CPU')); const name = await runningContainer();
    const config = JSON.parse(docker(['inspect', name, '--format', '{{json .HostConfig}}']));
    expect(config.NanoCpus).toBe(500000000); expect(config.Ulimits).toContainEqual({ Name: 'cpu', Soft: 3, Hard: 3 });
    await delay(2000);
    const stats = docker(['exec', name, 'cat', '/sys/fs/cgroup/cpu.stat']);
    const used = Number(/usage_usec (\d+)/.exec(stats)?.[1]); measuredCpuMicros = used; expect(used).toBeGreaterThan(300000);
    console.log(`Measured CPU usage before kernel termination: ${used} microseconds; hard RLIMIT_CPU=3 seconds.`);
    expect(await task).toMatchObject({ ok: false }); const e = evidence.at(-1)!;
    expect(e.oomKilled).toBe(false); expect(e.exitCode).toBe(137); expect(e.elapsedMs).toBeLessThan(11000); checkClean(e);
  }, 20000);

  it('inner wall watchdog kills an idle parser independently of parent timer', async () => {
    expect(await inspect(probe).inspect(bytes('WALL'))).toMatchObject({ ok: false });
    const e = evidence.at(-1)!; expect(e.terminated).toBe('completed'); expect(e.exitCode).toBe(137);
    expect(e.elapsedMs).toBeGreaterThanOrEqual(9500); expect(e.elapsedMs).toBeLessThan(14500); checkClean(e);
  }, 20000);

  it('cancellation terminates the actual container and excessive output is bounded', async () => {
    const controller = new AbortController(); const task = inspect(probe).inspect(bytes('WALL'), { signal: controller.signal });
    await runningContainer(); controller.abort(); expect(await task).toMatchObject({ ok: false, reasonCode: 'pdf_inspection_cancelled' }); checkClean(evidence.at(-1)!);
    expect(await inspect(probe).inspect(bytes('OUTPUT'))).toMatchObject({ ok: false, reasonCode: 'pdf_inspection_output_limit' }); checkClean(evidence.at(-1)!);
  }, 20000);

  it('has no network, writable filesystem, secrets, mounts, retained logs or elevated capabilities', async () => {
    const task = inspect(probe).inspect(bytes('WALL')); const name = await runningContainer();
    const info = JSON.parse(docker(['inspect', name]))[0];
    expect(info.HostConfig.NetworkMode).toBe('none'); expect(info.HostConfig.ReadonlyRootfs).toBe(true);
    expect(info.HostConfig.CapDrop).toContain('ALL'); expect(info.HostConfig.SecurityOpt).toContain('no-new-privileges');
    expect(info.HostConfig.LogConfig.Type).toBe('none'); expect(info.Mounts).toEqual([]); expect(info.Config.User).toBe('65534:65534');
    await task; checkClean(evidence.at(-1)!);
    expect(await inspect(probe).inspect(bytes('GUARDS'))).toEqual({ ok: true, value: { pageCount: 1 } }); checkClean(evidence.at(-1)!);
  }, 25000);

  it('terminates actual compressed-object amplification without egress; next clean PDF succeeds', async () => {
    const chunk = Buffer.alloc(1024 * 1024, 32); const parts: Buffer[] = [];
    async function* expanded() { yield Buffer.from('4 0 '); for (let i = 0; i < 512; i++) yield chunk; }
    for await (const part of Readable.from(expanded()).pipe(createDeflate())) parts.push(Buffer.from(part));
    const compressed = Buffer.concat(parts);
    const objects = [Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'), Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'), Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>'), Buffer.concat([Buffer.from(`<< /Type /ObjStm /N 1 /First 4 /Length ${compressed.length} /Filter /FlateDecode >>\nstream\n`), compressed, Buffer.from('\nendstream')])];
    const blocks = [Buffer.from('%PDF-1.7\n')]; const offsets: number[] = []; let at = blocks[0]!.length;
    objects.forEach((obj, i) => { offsets.push(at); const block = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), obj, Buffer.from('\nendobj\n')]); blocks.push(block); at += block.length; });
    blocks.push(Buffer.from(`xref\n0 5\n0000000000 65535 f \n${offsets.map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Root 1 0 R /Size 5 >>\nstartxref\n${at}\n%%EOF\n`));
    const bomb = Buffer.concat(blocks); expect(bomb.length).toBeLessThan(10 * 1024 * 1024);
    expect(await inspect(image).inspect(bomb)).toMatchObject({ ok: false }); const e = evidence.at(-1)!;
    expect(e.exitCode).not.toBe(0); checkClean(e);
    console.log(`Actual object-stream fixture: ${bomb.length} compressed bytes, ${512 * 1024 * 1024 + 4} decoded bytes; terminated before success.`);
    expect(await inspect(image).inspect(await generatedPdf(1))).toEqual({ ok: true, value: { pageCount: 1 } }); checkClean(evidence.at(-1)!);
  }, 30000);

  it('isolates simultaneous failed/valid parses and caps local work separately from SQL quotas', async () => {
    const hanging = inspect(probe); const a = hanging.inspect(bytes('WALL')); const b = hanging.inspect(bytes('WALL'));
    expect(await hanging.inspect(bytes('WALL'))).toMatchObject({ ok: false, reasonCode: 'pdf_local_capacity_exhausted' });
    expect(await inspect(image).inspect(await generatedPdf(2))).toEqual({ ok: true, value: { pageCount: 2 } });
    expect((await Promise.all([a, b])).every(r => !r.ok)).toBe(true);
    for (const e of evidence.slice(-3)) checkClean(e);
  }, 20000);

  it.each(['MEM', 'WALL'])('real handler settles only after %s termination with one admission and no provider dispatch', async mode => {
    const pdf = bytes(mode); const store = storeDouble();
    const evidenceStart = evidence.length;
    let currentEvidence: IsolationEvidence | undefined; let cleanupAtSettlement = false;
    const currentInspector = createDockerPdfInspector({ imageId: probe, onEvidence: e => { currentEvidence = e; evidence.push(e); } });
    store.finish.mockImplementation(async () => {
      cleanupAtSettlement = currentEvidence?.cleanupConfirmed === true;
      expect(evidence.length).toBe(evidenceStart + 1); expect(cleanupAtSettlement).toBe(true);
      return { ok: true, value: null };
    });
    const admission = createGuestAdmission({ store, bot: { verify: async () => true }, signingSecret: secret, allowedOrigin: context.origin, disclosureVersion: 'v1', now: () => time });
    const ticket = await admission.issueTicket({ ...issue, documentDigest: await sha256(pdf) }, context); if (!ticket.ok) throw Error('ticket_fixture');
    const cookie = await sign({ sessionId: context.serverSessionId, issuedAt: Date.parse(time), expiresAt: Date.parse(time) + 3600000 }, secret, 'session');
    const provider = { extract: vi.fn() };
    const handler = createTranscriptHandler({ allowedOrigin: context.origin, disclosureVersion: 'v1', sessionSecret: secret, eligibility: () => eligibility,
      maximumProviderCostMicrousd: 20, admission, store, provider, resolveNetwork: async () => context.networkKey, now: () => time, pdf: currentInspector });
    const controller = new AbortController();
    const responsePromise = handler(new Request(`${context.origin}/api/transcript/extract`, { method: 'POST', body: pdf, signal: controller.signal,
      headers: { origin: context.origin, 'Content-Type': 'application/pdf', cookie: `__Host-pathcheck_guest=${cookie}`, 'X-Extraction-Ticket': ticket.value.signedTicket, 'X-Consent-Receipt': ticket.value.consentReceiptId } }));
    if (mode === 'WALL') { await runningContainer(); controller.abort(); }
    const response = await responsePromise;
    expect(response.status).toBe(503); expect(store.admit).toHaveBeenCalledOnce(); expect(store.dispatch).not.toHaveBeenCalled(); expect(provider.extract).not.toHaveBeenCalled();
    expect(store.finish).toHaveBeenCalledWith(expect.objectContaining({ actualCostMicrousd: 0, outcome: 'failed' }));
    // The admission adapter catches thrown store assertions. Assert the captured
    // ordering again outside it so an earlier test's evidence cannot mask a race.
    expect(cleanupAtSettlement).toBe(true); expect(evidence.length).toBe(evidenceStart + 1);
    expect(currentEvidence).toBeDefined(); checkClean(currentEvidence!);
    // Store is explicitly simulated here; existing live SQL replay/lease tests remain separate.
    expect(ISOLATION_LIMITS.memoryBytes).toBe(268435456);
  }, 20000);
});
