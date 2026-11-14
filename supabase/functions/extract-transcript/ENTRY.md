# Function entry and host binding boundary

`index.ts` starts the actual `Deno.serve` listener through `entry.ts`. The default
static binding is **unconfigured**: all requests return a redacted 503, without
reading secrets or request bodies, setting cookies, parsing PDFs or calling an
external service. This closes the boot/module-resolution implementation gap; it
does not finish the hosted transcript endpoint.

`createFunctionEntry` accepts a `TranscriptBindingSource`: a complete server
binding or a request-to-binding factory. The latter gives each request its own
authenticated network identity and admission-store context. Binding resolution
has a one-second await bound and observes request cancellation. Host code must not use
a mutable process-global current network identity. The timeout prevents late
runtime construction; it cannot preempt arbitrary CPU or I/O started inside a
factory. Host adapters must bound their own work and propagate request cancellation.
The handler retains its 60-second bound.
Only static, reviewed code supplies this port; no environment variable, request
header or browser parameter selects a module or processing mode.

Boot rejects absent isolation, trusted-network, consent/lease recheck, admission
and storage ports, malformed HTTPS origin, disclosure ID or session secret before
loading provider secrets. An adapter's presence is **not** evidence of hosted
isolation or gateway trust. The existing handler still validates the approved
paid-processing contract for every request and before provider egress. Secrets
remain the existing `GEMINI_API_KEY` and `PATHCHECK_GEMINI_MODEL`; no new environment
file or enable flag is introduced. The configured server reader must stay private.
Unexpected setup/handler errors produce the same redacted response; the listener
also installs a redacted `onError` rather than the runtime's exception logger.

## Reproducible artifact

From the repository root after `npm ci --ignore-scripts`:

```sh
node supabase/functions/extract-transcript/build-entry.mjs
```

The command creates a private temporary `index.mjs`, printing only its path,
SHA256 and disabled-binding status. It uses the locked Vite dependency, disables
Vite env loading/config discovery, bundles the actual runtime and shared schemas
as neutral ESM, rejects any remaining static/dynamic imports and emits no source
map. It does not deploy, modify Supabase configuration or read `functions/.env`.
The source uses the existing bundler-style shared imports; run the emitted ESM,
not the unbundled `index.ts`, in Deno. Before an actual Supabase function run, L
must supply a reviewed build-artifact entrypoint in its owned configuration.
The temporary directory contains code only and may be removed after inspection.

The optional build-time `--bindings <reviewed-module.ts>` replaces the static
binding. That module must export `hostBindings: TranscriptBindingSource`. It is
ordinary trusted server source, not a credential file. L owns the eventual shared
composition and configuration. No such production binding is provided here.
Never build or deploy the synthetic test binding as a public endpoint.

## Executed checks

```sh
npm test -- tests/transcript/entry.test.ts tests/transcript/entryBundle.test.ts
node tests/transcript/entry.deno.mjs /absolute/path/to/deno
```

The second command requires Deno 2.9.8. It builds default and explicitly synthetic
artifacts, starts two short-lived actual Deno HTTP listeners on 127.0.0.1, checks
unconfigured rejection, no-store responses, signed secure guest cookies, missing
trusted identity and rejected bot proof, then shuts down and removes its code-only
temporary directory. It supplies an empty credential environment, denies env
access, run/FFI/system/write permissions, disables remote/npm module resolution,
allows networking only to 127.0.0.1 and explicitly denies Google/Turnstile. No real
PDF, SQL, Google, bot or hosted parser is used. The synthetic binding's reviewed
policy values exist solely in tests and do not represent an approved real project.

Verified Deno 2.9.8 macOS ARM64 release archive SHA256:
`9f0bf660393da2eaff044cdc7444cb08c73f235849b61d224d825a194ce7c98e`.
Use the [official Deno installation documentation](https://docs.deno.com/runtime/getting_started/installation/)
and [pinned release](https://github.com/denoland/deno/releases/tag/v2.9.8).
This test does not install Deno or alter the system PATH.

## Still required before hosted functionality

- L's authenticated same-origin gateway, current/previous rotating network keys,
  request-scoped actual SQL admission adapter and cookie/forwarding rules.
- Real browser bot integration and matching server Siteverify configuration.
- Approved, independently verified hosted per-request PDF resource isolation.
  The accepted local Docker inspector is not substituted for this requirement.
- Concrete Supabase Edge execution and configuration tests. Generic Deno boot
  proves bundle/API compatibility, not equivalence to the hosted Supabase runtime.
- Suitable real-data processing approval, privacy/retention verification and
  separate human deployment authorization. The free synthetic path stays private.

The main browser remains on its manual fallback until the complete reviewed
runtime is wired. Missing implementations are not deployment-only limitations.
No public-function-complete or release-ready claim follows from these tests.
