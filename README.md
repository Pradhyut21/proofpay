# ProofPay

**Turn delivery evidence into a clear client decision, then an invoice.**

Original project repository: [Pradhyut21/proofpay](https://github.com/Pradhyut21/proofpay).

![ProofPay delivery workspace](docs/screenshots/dashboard.png)

ProofPay is a hackathon prototype for freelance web designers and their clients. It keeps the agreed scope, a checklist, delivery evidence, client acceptance and PayPal invoice status in one workflow. AI assists with checklist extraction and evidence mapping; a person decides whether to accept the work.

The included Alder Studio example is an original, fictional $300 USD website milestone. Sample analysis and sample payment states are labelled fixtures. They do not represent a model invocation, a PayPal invoice or money moved.

**Current handoff:** a runnable source package and a captioned 2:45 sample walkthrough, `ProofPay-sample-walkthrough.mp4` (1920 × 1080, 25 fps). The submitter will add credentials later; real Gemini requests, PayPal sandbox payment and verified webhook delivery remain unverified. The sample walkthrough alone does not complete the PayPal-plus-AI submission demonstration.

**Verified locally:** 22 tests pass, TypeScript passes, and both the Worker and native Next.js production builds complete. A real browser exercised the full Worker sample review → client acceptance → invoice → simulated payment flow. The built Next.js app passed sign-in and unauthenticated-access checks, with no browser errors or 390px horizontal overflow. Its configured remote-database workflow remains unverified. See [Validation](docs/VALIDATION.md).

The [owner-private hosted preview](https://proofpay-pradhyut21.vividdaisy16.chatgpt.site) has been deployed. Hosted browser behavior and provider calls have not been verified. This preview requires the owner's access; judges should use the repository setup instructions until appropriate judging access is arranged. [GitHub Actions verification](https://github.com/Pradhyut21/proofpay/actions/runs/39592155031) also passed for the initial published source.

## Run locally

Use Node.js **22.x** (at least 22.13.0) and npm. From the repository root:

```sh
npm run install:ci
npm run build
```

Apply the SQL migration from `drizzle/` to local D1 using the command in [Setup](docs/SETUP.md), then run:

```sh
npm run dev
```

For a production-bundle preview after migration, use `npm start`.

Open the loopback URL printed by the server, normally `http://localhost:5173`. For the development-only seller identity, navigate to `/signin-with-chatgpt?return_to=/` on that URL. No external credentials are needed to explore the isolated sample workflow. Real Gemini analysis and PayPal sandbox invoicing require the configuration described below.

## Configure integrations

For Worker development, copy `.dev.vars.example` to the ignored `.dev.vars` file and supply your own Gemini and PayPal **sandbox** values. Native Next.js/Vercel uses the ignored `.env.local` file described below. Never commit credentials. Local browser preview is not a public webhook endpoint.

See [Setup and sandbox verification](docs/SETUP.md) for D1 initialization, built preview, secrets, HTTPS webhooks and the real payment checklist.

## Deploy to Vercel

Import your repository using the **Next.js** preset, root directory **`.`**, Node **22.x**, build command **`npm run build:vercel`** and the framework's default output directory. The included `vercel.json` configures the build; keep the output-directory override off.

Set **`TURSO_DATABASE_URL`**, **`TURSO_AUTH_TOKEN`** and a random **`PROOFPAY_OWNER_PASSWORD`** of at least 32 characters. Apply the included schema once with `npm run db:migrate:vercel`, using private local credentials. The seller signs in at `/signin` as `owner`; scoped client links and signed PayPal webhooks use separate authorization. Gemini and PayPal keys can be added later for real checks.

Follow the [Vercel deployment guide](docs/VERCEL.md) for exact import settings, database setup, environment scopes and access checks. An actual Vercel deployment has not been verified. The original `npm run build` / `npm start` commands remain the Sites/Vinext Worker path.

## Try the story

1. Inspect the Alder Studio brief and the checklist for Home, About, Contact, mobile layouts and a contact form.
2. Review the submitted evidence and the missing mobile Contact evidence.
3. Add the supplied synthetic artifact and analyze the updated evidence.
4. Open client review and accept the current evidence version.
5. Create a PayPal sandbox invoice when configured, or inspect the clearly marked sample simulation.

An AI evidence match is a reading aid. It is not proof of quality, a guarantee of delivery, an escrow service or an adjudication of a dispute.

## Project guide

| Document | Purpose |
| --- | --- |
| [Judge runbook](docs/JUDGE_RUNBOOK.md) | A short walkthrough, sample/live distinctions and edge cases |
| [Setup](docs/SETUP.md) | Local commands and real integration verification |
| [Vercel deployment](docs/VERCEL.md) | Next.js import settings, Turso persistence and owner sign-in |
| [Architecture](docs/ARCHITECTURE.md) | Data flow, identities and action boundaries |
| [API reference](docs/API.md) | Routes, data limits and version rules |
| [Devpost description](docs/DEVPOST.md) | Submission text, tagline and tool disclosure |
| [Demo script](docs/DEMO_SCRIPT.md) | 2:45 shot list and caption text |
| [Subtitles](docs/demo.srt) | Timed English subtitle source |
| [YouTube upload package](docs/YOUTUBE_UPLOAD.md) | Title, description, tags and upload record |
| [Submission checklist](docs/SUBMISSION_CHECKLIST.md) | Deliverables and remaining external steps |
| [Validation record](docs/VALIDATION.md) | What has and has not been verified |
| [Provenance](docs/PROVENANCE.md) | Original assets, dependencies and source links |

## Stack and license

React, TypeScript, Vinext, Vite, Tailwind CSS, Cloudflare Workers/D1, Drizzle, Gemini REST and PayPal Invoicing REST. Sites supplies the starter runtime and hosted identity. See `package.json` for dependency versions.

Original project contributions are available under the [MIT License](LICENSE), copyright 2026 Pradhyut21. Third-party packages and bundled vendor files retain their own licenses. Public YouTube upload and final Devpost submission remain separate steps.
