# Deploy your repository to Vercel

ProofPay has a native Next.js path for Vercel. It uses a persistent Turso database over HTTPS and a single owner password. The existing Worker commands continue to serve the Sites deployment.

**Status:** the native Next.js production build passed, as did 22 regression tests and TypeScript. The built app passed local HTTP authentication checks and a Chrome sign-in/mobile check. A positive owner workflow against a remote Turso database, persistence across redeployments, an actual Vercel deployment and real-provider checks remain unverified until credentials are supplied. See [Validation](VALIDATION.md).

## 1. Prepare the three required variables

Create a Turso database and obtain its database URL and authentication token. This application accepts a `libsql://`, `turso://` or HTTPS base URL and uses Turso's [SQL over HTTP API](https://docs.turso.tech/sdk/http/reference). Records persist in that database across Vercel function restarts.

Generate a random private owner password with at least 32 characters. Run this locally and save its output in your password manager:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

| Server variable | Value |
| --- | --- |
| `TURSO_DATABASE_URL` | Your database base URL |
| `TURSO_AUTH_TOKEN` | Token authorized to read and write that database |
| `PROOFPAY_OWNER_PASSWORD` | Your generated private password, at least 32 characters |

Select the intended **Production** or **Preview** environment for each value. Use separate databases and passwords for previews so tests cannot change production records. See Vercel's [environment variable scopes](https://vercel.com/docs/environment-variables).

## 2. Apply the database schema once

In a local checkout, copy `.env.example` to the ignored `.env.local` file and privately fill in those three values. From the repository root:

```sh
npm ci --include=dev --include=optional --no-audit --no-fund
npm run db:migrate:vercel
```

The migration command loads `.env.local`, applies the exact checked-in `drizzle/0000_faithful_rawhide_kid.sql` and records its checksum. A confirmed repeat reports `already_applied`; do not edit an applied migration to force a different schema. Run the setup for each new preview or production database. Migration is a setup step, not the Vercel build command.

## 3. Import your GitHub repository

In Vercel, choose **Add New → Project** and import [Pradhyut21/proofpay-paypal-ai-hackathon](https://github.com/Pradhyut21/proofpay-paypal-ai-hackathon).

| Setting | Value |
| --- | --- |
| Root Directory | Repository root (`.`) |
| Framework Preset | Next.js |
| Node.js Version | 22.x |
| Build Command | `npm run build:vercel` |
| Install Command | `npm ci --include=dev --include=optional --no-audit --no-fund` |
| Output Directory | Framework default; leave the override off (`.next` is managed by Next.js) |

The included `vercel.json` sets the framework and commands. Remove stale dashboard overrides pointing to `dist`, which belongs to the Worker build. See Vercel's [configuration reference](https://vercel.com/docs/project-configuration/vercel-json).

Add the three environment values before deploying. Ensure **Fluid compute** is enabled; API functions are configured for up to 120 seconds. See [function duration](https://vercel.com/docs/functions/configuring-functions/duration). The application selects its Vercel runtime automatically; no manual `PROOFPAY_HOSTING` value is needed.

Deploy and open the resulting URL. Visit `/signin`, use username **`owner`** and the private password, then open the seller workspace. This is a browser HTTP Basic challenge for one owner. It does not provide multiple user accounts or OAuth. Browsers can cache credentials; close the browser session when finished on a shared computer. This password is required for the Vercel runtime even on localhost. Public Sites identity headers cannot grant owner access.

Client review links authorize only their scoped review. Signed PayPal webhooks also remain separate from owner sign-in. Configure Vercel's platform Deployment Protection so intended clients, judges and PayPal can reach their routes; a gate across the entire site can block client links or webhook POSTs.

## 4. Add real AI and PayPal sandbox when ready

The three hosting variables enable the sample workflow. For real checks, add `GEMINI_API_KEY`, optionally `GEMINI_MODEL`, and all four PayPal values: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_INVOICER_EMAIL`, `PAYPAL_WEBHOOK_ID`. Keep them server-side; do not use `NEXT_PUBLIC_` names.

Register the final public HTTPS `/api/paypal/webhook` URL on the same PayPal sandbox REST app. The Vercel owner password provides the seller boundary; `PROOFPAY_SELLER_USER_ID` applies only to Sites. Incomplete PayPal configuration disables payments rather than substituting a sample result.

After changing Vercel variables, redeploy. Follow the real Gemini, invoice, buyer payment and webhook checks in [Setup](SETUP.md). Record results in `VALIDATION.md`; a deployment alone does not verify Gemini or PayPal.

## Check before sharing

1. An unsigned seller request cannot read the workspace; `/signin` challenges for owner credentials.
2. The owner can complete the sample review, invoice and simulated-payment flow with sample labels visible.
3. A client can open a fresh review link without the owner password and accept only that version and price.
4. Saved state remains after a redeployment using the same database.
5. For configured integrations, Gemini responds and the same sandbox invoice reconciles after buyer payment and a verified webhook. Check that Vercel protection has not intercepted PayPal's request.

For local Vercel-path development after setting `.env.local`, run `npm run dev:vercel`. For its local production preview, run `npm run build:vercel` followed by `npm run start:vercel`. Use `npm run build` and `npm start` for the separate Worker path.
