# API reference

Routes return JSON. Seller routes require the trusted Sites identity, or the isolated loopback identity during local development. Hosted non-sample payment actions also require the configured seller allowlist. Client review routes use a scoped bearer token; the PayPal webhook uses provider signature verification.

Mutations return the updated workspace unless noted. Write requests are checked for same-origin browser context. Errors have the shape `{ "error": "Readable message", "code": "MACHINE_CODE" }`.

| Method | Route | Body / result |
| --- | --- | --- |
| GET | `/api/config` | Provider/model, payment mode, auth state and capabilities; no secret values |
| GET | `/api/workspace` | Seller workspace; seeds fictional example on first access |
| POST | `/api/workspace/reset` | `{}`; replays sample mode, blocked for a real PayPal invoice |
| POST | `/api/requirements` | `{ "text": "Agreement text" }`; extracts checklist, increments content version |
| POST | `/api/evidence` | `{ "title": "Report", "text": "Evidence text", "kind": "test_report" }`; `kind` optional |
| POST | `/api/analyze` | `{}`; Gemini or deterministic sample assessment of current text |
| POST | `/api/approval/link` | `{}`; returns workspace, scoped review URL and expiry |
| GET | `/api/review/[token]` | Current version-scoped review snapshot |
| POST | `/api/review/[token]/accept` | `{ "clientName": "Reviewer's name" }`; returns accepted review snapshot |
| POST | `/api/invoice` | `{ "clientEmail": "sandbox-buyer@example.test" }`; buyer email required for real sandbox mode |
| POST | `/api/invoice/refresh` | `{}`; fetches the existing PayPal invoice in sandbox mode |
| POST | `/api/demo/pay` | `{}`; sample invoice only; disabled when PayPal configured |
| POST | `/api/paypal/webhook` | PayPal event and verification headers; no seller identity required |

The `.test` email above illustrates the request shape; use the actual sandbox personal buyer account when configuring PayPal. Do not use a real customer's address for the synthetic walkthrough.

## Constraints

- This prototype uses a positive fixed USD milestone; the example is 30,000 minor units, or $300.00.
- Up to 12 text evidence artifacts are supported per milestone. Evidence text is limited to 12,000 characters; an agreement to 20,000 characters.
- Creating a review requires a current analysis with every requirement marked `met`. This is an evidence-coverage gate and has no manual override in the prototype; it is not a work-quality guarantee.
- Review links expire after 48 hours. An accepted exact version remains approved after the link's acceptance window expires; the expired URL itself is no longer accessible.
- New evidence, changed requirements or reanalysis invalidate earlier review approval. An existing invoice locks its milestone content against further edits. A real PayPal invoice also blocks reset; sample mode can reset its own simulated invoice to replay the story.
- Invoice operations persist their request identifiers before provider calls and reuse them on retry. Real duplicate/retry behavior still needs sandbox verification.
- An externally recorded paid invoice is distinguished from a fully paid PayPal transaction. Pending and partial states are not promoted to fully paid.

The source under `lib/proofpay/` is the authoritative implementation. `VALIDATION.md` records exercised behavior separately from these implementation constraints.
