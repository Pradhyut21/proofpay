# Setup and sandbox verification

## Credential-free local package

Requirements: Node.js **22.13.0 or newer**, npm and a current desktop browser. Internet access is needed for the first dependency installation. A clean checkout uses the portable runtime profile automatically; it does not require the Codex plugin to start locally.

From the repository root:

```sh
npm run install:ci
npm run build
```

The build generates `dist/server/wrangler.json` with the `DB` binding from `.openai/hosting.json`. On a fresh local database, apply the included migration:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_faithful_rawhide_kid.sql
```

Apply subsequent SQL migrations in filename order if any are added. Do not replay migrations already applied to an existing database. Keep `.wrangler/state` as the persistence directory; Wrangler adds its versioned subdirectories itself.

Start development:

```sh
npm run dev
```

Open the printed loopback URL, normally `http://localhost:5173`. The seller routes allow an isolated loopback demonstration identity. The starter also supports development-only Sites sign-in at `/signin-with-chatgpt?return_to=/`; it is not production authentication. Initial workspace access seeds the fictional Alder Studio scenario.

The complete sample workflow works without Gemini or PayPal credentials. It exercises saved state, evidence review, client acceptance and isolated payment fixtures. **This does not complete the hackathon's real PayPal-plus-AI integration demonstration.** The submitter has chosen to add credentials later.

## Preview the built Worker

```sh
npm start
```

Use the URL printed by Wrangler. The command binds to `127.0.0.1` and shares the same local D1 state. To choose a port:

```sh
npm start -- --port 8787
```

`npm run build` and `npm start` do not deploy the application. `npm run lint` and `npx tsc --noEmit` are available as source checks; record actual results in `VALIDATION.md`.

The focused backend policy and reconciliation tests run without external credentials:

```sh
node --experimental-transform-types --import ./tests/backend-loader.mjs --test ./tests/backend.test.mjs
```

These tests do not replace an actual Gemini call or PayPal sandbox payment/webhook exercise.

## Add private configuration later

Choose `.dev.vars` for local Worker development:

```powershell
Copy-Item -LiteralPath .dev.vars.example -Destination .dev.vars
```

On macOS/Linux, use `cp .dev.vars.example .dev.vars`. Edit only the local copy. Do not put populated values in version control, screenshots, issue comments or Devpost text. `.env.example` describes the same deployment contract; use one local file format rather than both.

| Variable | Meaning |
| --- | --- |
| `GEMINI_API_KEY` | Server-side Gemini API credential |
| `GEMINI_MODEL` | Optional model available to that account; the UI reports the selected model |
| `PAYPAL_CLIENT_ID` | Sandbox REST application's client ID |
| `PAYPAL_CLIENT_SECRET` | That sandbox app's server-side secret |
| `PAYPAL_INVOICER_EMAIL` | Sandbox business account email issuing the invoice |
| `PAYPAL_WEBHOOK_ID` | Webhook registration ID for the same sandbox app |
| `PROOFPAY_SELLER_USER_ID` | Required for hosted configured PayPal mode: the raw Sites `oai-authenticated-user-id` value, without a `sites:` prefix |
| `PROOFPAY_PAYMENT_MODE` | Optional `paypal_sandbox` requirement; with missing keys the mode is unavailable rather than sample |

Wrangler reads local secret files beside its active configuration. Development uses the project root; the built preview uses `dist/server/wrangler.json`. For configured built preview, after the build copy the local file beside that generated config:

```powershell
Copy-Item -LiteralPath .dev.vars -Destination dist/server/.dev.vars
```

Both locations are ignored by Git. Rebuilds may replace generated output, so copy again after rebuilding. Restart the preview after configuration changes. See [Cloudflare's local secret-file rules](https://developers.cloudflare.com/workers/local-development/environment-variables/).

The AI and payment modes are independent. Empty Gemini credentials select deterministic sample analysis. The implemented Gemini default is `gemini-3.5-flash`; `GEMINI_MODEL` can override it with a model available to the supplied account. Any partial PayPal configuration makes the PayPal integration unavailable; fix the configuration instead of treating a sample as a failed real call's replacement. Hosted seller access requires the allowlist as soon as any PayPal setting is present. Local loopback access stays isolated for development.

## Verify a real Gemini call

1. Supply a Gemini key and, optionally, a supported model override.
2. Restart the server. Confirm the configuration/UI says Gemini and inspect its model name.
3. Analyze synthetic evidence. Check that the response is stored as provider `gemini`, includes exact source quotations and covers each requirement.
4. Record the actual model, timestamp and redacted result in `VALIDATION.md`. A configured key alone does not establish that a model request succeeded.

Only use customer documents with permission to send them to that provider. The model sees the supplied text, not independently executed websites, inboxes or screenshot pixels.

## Verify PayPal sandbox end to end

1. Create a sandbox **business** account and REST app in the PayPal Developer Dashboard. Use a separate sandbox **personal** buyer for payment. Obtain the issuing business email and that app's client credentials.
2. Make the webhook route reachable over **public HTTPS**. A localhost address cannot receive PayPal notifications. A private Sites login gate can also block webhook delivery; the webhook path must be reachable by PayPal while seller actions remain authenticated. A tunnel or deployment still needs the application's trusted seller boundary configured correctly.
3. Register the exact `/api/paypal/webhook` URL on the same sandbox REST app, subscribe to relevant invoicing events, and save its registration ID as `PAYPAL_WEBHOOK_ID`. This ID is different from the client ID. Verify the final route against the checked-out source before registration.
4. Set all PayPal values privately, restart, and confirm the app reports PayPal sandbox mode. For a hosted configured build, set `PROOFPAY_SELLER_USER_ID` to the actual site-scoped seller ID from a trusted Sites session. Do not accept an arbitrary public request's identity header as authentication.
5. Complete a current analysis and client acceptance. Supply the sandbox personal buyer email, create/send the invoice, and save its ID and expected $300.00 USD amount privately.
6. Open the returned PayPal sandbox payer link and complete payment as that buyer using test funds.
7. Refresh invoice status and verify the received webhook. Confirm the same invoice ID, currency, full amount and PayPal transaction state. A UI redirect, manually posted JSON event or externally recorded payment is not evidence of an online sandbox payment.
8. Exercise unsigned/duplicate webhook handling and duplicate invoice creation. Put only redacted identifiers and results in `VALIDATION.md`.

See [PayPal sandbox](https://developer.paypal.com/tools/sandbox/), [Invoicing API](https://developer.paypal.com/docs/api/invoicing/v2/) and [webhook verification](https://developer.paypal.com/api/rest/webhooks/rest/).

## Hosting boundary

The packaged application targets Sites/Vinext on Cloudflare Workers with D1. A hosted seller session relies on Sites dispatch stripping untrusted identity headers and injecting its own authenticated identity. A direct generic Worker or Node deployment needs a separate trusted authentication integration; changing a hosting command alone is insufficient.

No `render.yaml` is included: a Render Node service would not automatically provide the Worker environment, D1 database or Sites identity. Use the supported Sites lifecycle for hosting, or port these boundaries explicitly before choosing another platform.

The functional local setup is the deliverable while credentials are supplied later. Public repository access, hosted access policy, real integration verification, publicly visible YouTube upload and final Devpost submission must each be checked separately.
