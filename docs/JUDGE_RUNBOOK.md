# Judge runbook

## What this build demonstrates

A web freelancer turns an agreed brief into reviewable requirements, supplies evidence, gets an explicit client decision and proceeds to invoicing. The prepared example is fictional. Its screenshot manifests and QA notes are text evidence; no actual website, screenshot pixels or inbox is independently verified.

Start with the [README](../README.md) and [Setup](SETUP.md). A local run uses a development-only identity. A hosted seller workspace needs Sites sign-in and appropriate access. The submitter must provide judges with working access or a fully runnable local setup.

## Three-minute inspection

1. **Check the mode.** Read the AI provider/model and payment mode shown by the interface. Sample mode means deterministic analysis and simulated invoices. Gemini or PayPal sandbox labels require configured integrations.
2. **Read the agreement.** Open Alder Studio's $300 USD website handoff. It calls for Home, About and Contact pages, mobile screenshots of every page, and a contact-form report demonstrating both submission and received email.
3. **Inspect the gap.** Analyze the initial evidence. The mobile manifest omits the Contact capture, and the contact-form note does not establish inbox delivery. Open a cited excerpt and compare it with its actual evidence text.
4. **Add evidence.** Use the prepared completion artifact or paste the synthetic completion report in `SEED_EVIDENCE.md`. Analyze again. Observe the new content version and the fact that the added text is a report, not an independently executed test.
5. **Review as client.** Create the client review link, open it in a separate tab and read the requirements, quotes, version and price. Enter a review name if prompted and explicitly accept that version. A bearer link represents access to the review, not independently verified legal identity.
6. **Invoice.** Return to the seller workspace. In configured sandbox mode, supply the sandbox buyer email and create/send the invoice. In sample mode, inspect the simulated invoice and its explicit sample label. A sample payment action moves no money.
7. **Inspect history.** Review the activity entries. Distinguish evidence changes, analysis, human acceptance and invoice/payment events.

## Useful failure cases

| Try | Expected behavior to inspect |
| --- | --- |
| Invoice before current client acceptance | Server refuses the operation |
| Add evidence after creating a review | The previous version cannot authorize the changed content |
| Reuse an expired or invalid review token | Review is rejected; no seller workspace access |
| Repeat invoice creation | No duplicate invoice for the same approved milestone |
| Configure only some PayPal values | Integration is unavailable; no silent simulated success |
| Simulate payment for a real PayPal invoice | Rejected; sample actions are isolated |
| Submit an unsigned webhook | Rejected; no paid state |
| Paste instructions into evidence | Treated as document text; cannot authorize payment |

These are verification targets. The [validation record](VALIDATION.md) states which have actually been exercised.

## Real sandbox demonstration

Follow `SETUP.md` with the submitter's sandbox business app and a separate sandbox personal buyer. Complete actual client acceptance, issue and pay the invoice on PayPal's sandbox page, then verify the matching invoice and paid amount after refresh/webhook reconciliation. Save redacted IDs and timestamps in `VALIDATION.md`.

No real payment, independent work-quality certification, escrow or user-study result is claimed by the credential-free walkthrough.
