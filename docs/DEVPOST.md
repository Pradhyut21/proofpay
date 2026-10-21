# Devpost submission text

## Project name

ProofPay

## Tagline

Turn delivery evidence into a clear client decision, then a PayPal invoice.

## Inspiration

A freelancer can finish a milestone and still face a confusing handoff: what was agreed, where is the evidence, and what exactly is the client approving? Those questions often live in separate chats, files and invoices. ProofPay brings them into one review so both sides can see the same scope and evidence before an invoice is issued.

## What it does

ProofPay helps a freelance web designer organize an agreed brief into a checklist and attach delivery evidence. Its AI integration proposes matches between checklist items and evidence, with excerpts a client can inspect. Missing support stays visible instead of being hidden behind a completion score.

The client reviews the current evidence version and makes the acceptance decision. The seller can then create and send a PayPal sandbox invoice and reconcile its status. The built-in Alder Studio scenario demonstrates a $300 website milestone with missing Contact-page mobile evidence and incomplete inbox-delivery evidence, followed by a revised submission and client review.

Sample mode uses explicit synthetic fixtures, including simulated invoice states. Actual model analysis and PayPal sandbox operations require configured credentials. This prototype does not claim that AI can certify subjective work quality or settle disputes.

## How we built it

The interface uses React, TypeScript and Tailwind CSS on the Sites Vinext starter. Server routes run on a Cloudflare Worker with D1 persistence and Drizzle migrations. Sites identity separates the seller workspace from a token-scoped client review.

Gemini REST is the configurable runtime AI integration for checklist and evidence assistance. PayPal Invoicing REST is the payment integration: server-side credentials create, send and fetch sandbox invoices, while the webhook path verifies PayPal messages before reconciliation. The AI comparison and payment operations are separate steps; client acceptance remains explicit.

## Challenges we ran into

The main design challenge was making an AI suggestion useful without treating it as a verdict. We needed evidence excerpts, a visible missing state and a version-specific human decision. Payment status required a different source of truth: a browser click or an AI output cannot establish that an invoice has been paid. Keeping sample fixtures distinct from real integration responses was also essential for an honest demo.

## Accomplishments that we're proud of

The prototype connects scope, evidence, client review and invoicing in one coherent product flow. Its sample scenario makes the missing-evidence case easy to inspect, and its integration boundaries support real Gemini requests and PayPal sandbox verification when credentials are supplied. The repository includes setup instructions, a judge runbook, an architecture diagram and a reproducible demonstration plan.

## What we learned

Evidence coverage and work acceptance answer different questions. AI can help people find relevant evidence, but the client still needs context and judgment. Payment events also need their own verification and reconciliation; the interface should clearly communicate which state came from a fixture, an AI response, a human decision or PayPal.

## What's next for ProofPay

Test the handoff with consenting freelancers and clients; evaluate missed evidence and unsupported matches; improve evidence parsing; and strengthen revocation, retention controls and seller onboarding. Any escrow, marketplace payouts, dispute handling or production payments would need separate product and integration work.

## Built with

TypeScript, React, Vinext, Vite, Tailwind CSS, Cloudflare Workers, Cloudflare D1, Drizzle ORM, Gemini API, PayPal Invoicing API, Sites.

## Tools and AI disclosure

- **Development assistance:** Codex helped research, design, implement and document this prototype. The submitter reviews and is responsible for the submitted work.
- **Runtime AI:** the application has a server-side Gemini REST integration. The configured `GEMINI_MODEL` determines the model used. Credential-free sample results are deterministic fixtures, not generated responses. Record the actual model used in the final validation record after a successful invocation.
- **Payments:** PayPal Invoicing sandbox integration. A simulated paid state is not a sandbox transaction. Attach verified sandbox evidence before claiming a successful payment.
- **Assets:** original fictional brief, evidence text and interface; no external stock photos, music or customer documents are required.
- **Sponsor tools:** claim a sponsor-specific integration only if it is implemented and exercised. This build does not claim use of AG Grid, APIMatic, Render or other optional sponsors merely because they appear in the event.

## Submission fields to complete

Source repository: https://github.com/Pradhyut21/proofpay

Functional access: complete local setup and judge instructions are included in that repository. The [optional hosted preview](https://proofpay-pradhyut21.vividdaisy16.chatgpt.site) is deployed with owner-private access; hosted behavior has not been browser-verified, and it is not unrestricted judge access.

Add the publicly visible YouTube URL after uploading and checking the final demonstration. Gemini and actual PayPal sandbox execution still require the submitter's credentials and verification. Eligibility and final Devpost acceptance remain the submitter's responsibility.
