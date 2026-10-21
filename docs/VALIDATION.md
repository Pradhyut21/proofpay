# Validation record

Verified locally on **21 October 2026**. Sample behavior is distinguished from actual external service execution.

| Check | Result | Evidence |
| --- | --- | --- |
| Locked dependency installation | Passed | 686 packages installed; installer exit 0 |
| Backend regression tests | **15 passed, 0 failed** | npm test; SQLite-backed D1 adapter; mocked provider HTTP only |
| TypeScript | Passed | tsc --noEmit, exit 0 |
| Production Worker build | Passed | All five Vinext build stages completed, exit 0 |
| Clean local D1 schema | Passed | drizzle/0000_faithful_rawhide_kid.sql; four statements executed successfully |
| Browser sample workflow | Passed | Actual Chrome session: initial gaps → new evidence → client acceptance → sample invoice → simulated paid state; no page errors |
| Mobile layout | Passed | 390 × 844 viewport; no horizontal overflow; screenshots/mobile.png |
| Invoice before client approval | Rejected | Actual HTTP 409 |
| Invalid review token | Rejected | Actual HTTP 404 |
| Cross-origin evidence mutation | Rejected | Actual HTTP 403 |
| Unconfigured webhook | Rejected | HTTP 503 WEBHOOK_NOT_CONFIGURED; not a configured signature-verification test |
| Sample payment isolation | Passed | Browser invoice provider remains sample; no PayPal calls or money movement |
| Real Gemini request | **Not verified: submitter adds credentials later** | Implemented server integration; sample analysis is deterministic rules |
| Real PayPal sandbox invoice/payment | **Not verified: submitter adds credentials later** | Implemented create/send/get/reconcile; simulation is not a sandbox payment |
| Actual signed PayPal webhook | **Not verified without credentials/public HTTPS** | Verification code exists; live delivery pending |
| Public GitHub access and license | Publication verification pending | Repository created under Pradhyut21 |
| Hosted preview | Deployment verification pending | Owner-private preview is optional; repository instructions provide functional access |
| Demo footage | Captured | Actual 1440 × 810 application recording; 146.6 seconds; captioned export pending |
| Public YouTube upload | **Pending submitter upload** | Never infer an upload from a local MP4 |
| Devpost submission | **Pending submitter action** | Description, tool disclosure and checklist prepared |

Tests cover evidence gaps; fabricated citations; checklist extraction; ownership and CSRF; incomplete provider configuration; approval/version/price binding; stale links; compare-and-swap; partial, pending and externally recorded payments; negative inbox evidence; frozen retry payloads; attempt leases; late errors after paid/refunded webhooks; and stale provider reads racing a newer payment.

Provider race tests use mocked HTTP, not actual PayPal. No benchmark accuracy, real customer validation, commercial impact, escrow, production certification or awards are claimed.

## Verification limits

The development server was used for the complete browser walkthrough. One earlier built-preview process stopped unexpectedly; a successful production build alone does not establish long-running production reliability. Hosted execution must be checked separately.

Do not add API keys, client secrets, access tokens, review bearer URLs or sandbox passwords to this public record.
