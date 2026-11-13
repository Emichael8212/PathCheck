# PR Information

- PR:[#8 — secure transcript extraction runtime](https://github.com/Emichael8212/PathCheck/pull/8)
- Implementation SHA:`75aa73ee912186670c4256189db48a4a238f7fcd`
- Test type:synthetic transcript browser/API integration.
- Feature:PDF admission, provider extraction/retries, consent and raw-row proposals.
- Human status:**NOT RUN**; eligibility:**BLOCKED** on live fixture-only browser composition.

## Before You Begin

Do not upload a real transcript. The free-tier fixture benchmark passes, but the
public paid-processing eligibility contract remains disabled. Browser acceptance
requires the reviewed local synthetic runtime, admission service and frontend from
PR6/7/9. No fake paid approval or simulated Google success can clear this gate.

## Step-by-Step Test

The actual live browser acceptance procedure is not ready. Do not treat the
following reproducible diagnostic command as human acceptance:

```sh
cd /Users/_eman5michael/pathcheck-gemini
test "$(git rev-parse HEAD)" = 75aa73ee912186670c4256189db48a4a238f7fcd
npm ci --ignore-scripts
npm test -- tests/transcript
```

This runs137 extraction tests with explicitly simulated provider transport; it
checks implemented security/error behavior without sending data to Google.
The lead must replace this blocked procedure with exact Chrome upload/accept/planner
steps once the live local composition is verified. No human action is required now.

## Expected Result

Diagnostic137 PASS; it does not prove live browser extraction. The independently
measured live corpus is documented in [benchmark evidence](../../testing/transcript-synthetic-benchmark.md).

## Screenshot Checkpoint

Pending actual browser procedure. No screenshot is requested while eligibility is
blocked; diagnostic screenshots cannot establish the missing live workflow.

## Pass/Fail Criteria

Human PASS requires a supported synthetic PDF through the actual consent/admission/
Gemini path, correct proposed rows, explicit acceptance and real deterministic
planner results. Current simulated integration results do not meet that condition.

## Cleanup

The diagnostic test exits automatically and starts no external service. Do not
remove the existing worktree or modify the private environment file.

## Known Limitations

Human verification remains blocked independently of passing CI/unit/live benchmark
evidence. Trusted gateway/bot infrastructure, runtime resource isolation and approved
real-data privacy are additional gates; synthetic success never approves real records.
