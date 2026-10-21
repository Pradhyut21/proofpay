# Validation record

Verified locally on **21 October 2026**. Sample behavior is distinguished from actual external service execution.

| Check | Result | Evidence |
| --- | --- | --- |
| Locked dependency installation | Passed | 686 packages installed; installer exit 0 |
| Regression tests | **22 passed, 0 failed** | npm test; 16 backend/auth tests plus six SQLite-backed Hrana adapter/migration tests; provider HTTP mocked |
| TypeScript | Passed | tsc --noEmit, exit 0 |
| Production Worker build | Passed | All five Vinext build stages completed, exit 0 |
| Native Next.js production build | Passed | Next.js 16.3.4, webpack; compilation, TypeScript, prerender and trace collection completed |
| Built Next.js authentication boundary | Passed locally | Port 3100: unauthenticated config reports localDemo=false and /signin; forged Sites headers and loopback access rejected with 401; cross-origin POST rejected with 403 |
| Built Next.js missing configuration | Controlled responses | /signin without owner password returns 503; unconfigured webhook returns 503 WEBHOOK_NOT_CONFIGURED without an owner Basic challenge |
| Built Next.js browser and mobile | Passed locally | Chrome owner sign-in interface; 390px viewport without horizontal overflow; zero page errors |
| Configured Vercel workflow and persistence | **Not verified** | Positive owner workflow against a remote Turso database and persistence across redeployments need credentials |
| Hosted Vercel deployment and remote migration | **Not verified** | Owner must import the repository and configure Vercel/Turso credentials; see VERCEL.md |
| GitHub Actions verification | Passed | [Initial source verification run](https://github.com/Pradhyut21/proofpay/actions/runs/39592155031) |
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
| Public GitHub access and license | **Verified** | Unauthenticated GitHub API returned HTTP 200, public repository, owner Pradhyut21 and MIT; source published through 5d1f61aae01a48704b8f1ba5e12f22c28a0956ac |
| Hosted preview deployment | **Deployed; owner-private** | [Preview](https://proofpay-pradhyut21.vividdaisy16.chatgpt.site), source 5d1f61aae01a48704b8f1ba5e12f22c28a0956ac; native deployment succeeded; hosted browser/provider behavior not verified |
| Demo footage and captioned export | **Exported and checked** | ProofPay-sample-walkthrough.mp4; H.264, 1920 × 1080, 25 fps, 165.000 seconds, 4,125 frames, 7,629,267 bytes; actual 145.6-second browser capture with a 0.4-second final hold |
| Export visual samples | Passed | Frames at 6, 50, 90, 141 and 161 seconds plus a 90-second close-up inspected; complete app image, readable captions and explicit sample state |
| Public YouTube upload | **Pending submitter upload** | Never infer an upload from a local MP4 |
| Devpost submission | **Pending submitter action** | Description, tool disclosure and checklist prepared |

Tests cover evidence gaps; fabricated citations; checklist extraction; ownership and CSRF; Vercel owner authentication and forged-header rejection; incomplete provider configuration; approval/version/price binding; stale links; compare-and-swap; partial, pending and externally recorded payments; negative inbox evidence; frozen retry payloads; attempt leases; late errors after paid/refunded webhooks; stale provider reads racing a newer payment; and the Turso/Hrana SQL adapter and tracked migration against a local SQLite-backed protocol test service.

Provider race tests use mocked HTTP, not actual PayPal. No benchmark accuracy, real customer validation, commercial impact, escrow, production certification or awards are claimed.

## Verification limits

The development server was used for the complete browser walkthrough. One earlier built-preview process stopped unexpectedly; a successful production build alone does not establish long-running production reliability. The hosted deployment succeeded, but its browser behavior and external provider execution must be checked separately. Its owner-private access does not provide unrestricted judge access.

The Hyperframes composition passed its checks, with two structural warnings. Full browser rendering failed after disk and browser-runtime errors. The final video was assembled with FFmpeg using verified Hyperframes opening/closing snapshots, the corrected actual capture and matching captions. Its media properties and the visual samples listed above were checked. This does not claim a completed full Hyperframes browser render or a public video upload.

Do not add API keys, client secrets, access tokens, review bearer URLs or sandbox passwords to this public record.
