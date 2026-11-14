// Explicit build context contains code only. Never sends the repository or .env to Docker.
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { build } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const context = await mkdtemp(join(tmpdir(), 'pathcheck-pdf-image-'));
try {
  await build({ configFile: false, root: here, logLevel: 'error', ssr: { noExternal: true },
    build: { ssr: join(here, 'parserMain.ts'), outDir: context, emptyOutDir: false, minify: false,
      rolldownOptions: { output: { entryFileNames: 'parser.mjs', codeSplitting: false } } } });
  await writeFile(join(context, 'Dockerfile'), await readFile(join(here, 'Dockerfile')));
  execFileSync('docker', ['--context', 'colima-pathcheck-test', 'build', '--network=none', '--pull=false', '-t', 'pathcheck-pdf-parser:local-v1', context], { stdio: ['ignore', 'inherit', 'inherit'] });
  const id = execFileSync('docker', ['--context', 'colima-pathcheck-test', 'image', 'inspect', 'pathcheck-pdf-parser:local-v1', '--format', '{{.Id}}'], { encoding: 'utf8' }).trim();
  if (!/^sha256:[a-f0-9]{64}$/.test(id)) throw new Error('image_identity_unavailable');
  console.log(`PATHCHECK_PDF_IMAGE=${id}`);
} finally { await rm(context, { recursive: true, force: true }); }
