# Real component integration verification

PR9 now composes the merged engine, UI and PDF exporter at the ordinary `/` route.
The root no longer requires `application.patch`; that file is retained solely for
reproducing historical accepted commits. Do not apply it to the current branch.

From a checkout of the exact PR9 head:

```sh
npm ci --ignore-scripts
npm run check
npm run test:integration
node node_modules/@playwright/test/cli.js test -c tests/ui/browser/playwright.ui.config.ts
node tests/e2e/normalization.integration.mjs
```

The default production smoke verifies the actual application, manual acceptance,
provisional academic uncertainties and PDF export. Integration journeys additionally
use an explicitly synthetic catalog/time with actual E/U/L logic. No canned engine
results or external calls. Screenshot, trace and video capture remain disabled.
`PATHCHECK_TEST_BUILD=1 npm run test:integration` remains an optional production-root
check; the synthetic harness is deliberately not bundled.

Live upload uses the separately protected local fixture-only server described in
[upload verification](../upload/README.md) and the [accepted combined guide](../../../docs/acceptance/pr-9/PR_ACCEPTANCE_TEST.md).
Its real Google result must never be inferred from simulated error tests. Public
transcript processing and cloud account composition remain disabled/open gates;
this root integration does not waive them or declare full MVP completion.

Future combinations of unmerged features still use exact pinned heads on a local,
noncommitting scratch branch, never pushed. Record evidence in the lead ledger.
Preserve existing human acceptance worktrees and evidence. Only the human merges.
