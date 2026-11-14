// Produces a self-contained ESM function. Vite env loading is disabled: no .env
// reads, browser define injection, external imports, source maps or secret values.
import { build } from 'vite';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function buildFunctionEntry(entry = join(dirname(fileURLToPath(import.meta.url)), 'index.ts'), bindingsModule) {
  const results = await build({ configFile: false, envFile: false, logLevel: 'error',
    ...(bindingsModule ? { resolve: { alias: [{ find: './hostBindings', replacement: resolve(bindingsModule) }] } } : {}),
    ssr: { noExternal: true },
    build: { ssr: entry, write: false, minify: false, sourcemap: false,
      rolldownOptions: { platform: 'neutral', output: { entryFileNames: 'index.mjs', codeSplitting: false } } } });
  const builds = Array.isArray(results) ? results : [results];
  if (builds.length !== 1 || !('output' in builds[0])) throw new Error('unexpected_function_artifact');
  const output = builds[0].output;
  if (output.length !== 1 || output[0].type !== 'chunk' || output[0].imports.length || output[0].dynamicImports.length)
    throw new Error('function_external_dependency');
  return { code: output[0].code, sha256: createHash('sha256').update(output[0].code).digest('hex') };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 2 && !(process.argv.length === 4 && process.argv[2] === '--bindings')) throw new Error('invalid_build_arguments');
  const artifact = await buildFunctionEntry(undefined, process.argv[3]);
  const directory = await mkdtemp(join(tmpdir(), 'pathcheck-function-entry-'));
  await writeFile(join(directory, 'index.mjs'), artifact.code, { mode: 0o600 });
  console.log(JSON.stringify({ artifact: join(directory, 'index.mjs'), sha256: artifact.sha256,
    processing: process.argv[3] ? 'caller_supplied_static_bindings_requires_review' : 'disabled_pending_reviewed_host_bindings' }));
}
