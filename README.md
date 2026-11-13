# PathCheck

Gate 0 foundation for the approved F01–F20 academic planner. This branch contains contracts, source handoffs and tooling; no working degree audit, scheduler, authentication, PDF export or transcript endpoint is claimed.

Use Node 24 (see `.nvmrc`):

```sh
npm ci
npx playwright install chromium
npm run check
npm run dev
```

CI installs Chromium with Linux dependencies. `npm run check` runs lint, strict typecheck, unit/contract tests, production build and Chromium smoke test. Browser tests have no screenshots/traces or student inputs.

Start/resume with [AGENTS.md](AGENTS.md), role specifications and [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md). Approved curriculum decisions are in [DECISIONS.md](DECISIONS.md); privacy-clean historical/current source handoffs are in `docs/curriculum/`. Only E may implement executable catalogs. Original personal source material stays outside Git.

Main requires human PR merges. No automatic merge or production deployment. The foundation workflow must become a required status check before agent implementation branches launch. External academic/privacy/RLS gates remain separate from green foundation CI.
