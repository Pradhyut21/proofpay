# Provenance and permissions

## Original project material

The ProofPay product wording, fictional Alder Studio agreement, sample evidence text, demonstration identifiers, submission description, narration and subtitles were created for this project with Codex assistance. The sample material contains no real client records. The original application contribution is released under the root MIT license.

The demo uses an actual browser recording of the running application, original title cards and timed English captions. It contains no external stock photos, stock videos, receipt images, customer documents, voice recording or music. The title cards do not replace the functioning application footage.

## Third-party software

The project builds on the Sites Vinext starter and npm dependencies identified in `package.json` and `package-lock.json`. Framework, library, font and icon assets retain their own license terms; the root license does not replace them. Preserve bundled notices including `vendor/shadcn-tailwind-4.13.0.LICENSE.md` and `build/sites-vite-plugin.LICENSE`.

Gemini and PayPal are external services, not project-owned software. Their names identify the integrations and do not imply endorsement. Before final video upload, check any service UI or marks captured against the applicable permissions. Avoid added decorative third-party logos and copyrighted soundtrack material.

## Research and implementation references

These are references, not claims that third-party code or papers were authored by this entrant:

- [PayPal Invoicing API reference](https://developer.paypal.com/docs/api/invoicing/v2/)
- [PayPal REST webhooks integration](https://developer.paypal.com/api/rest/webhooks/rest/)
- [PayPal sandbox guide](https://developer.paypal.com/tools/sandbox/)
- [Gemini structured output documentation](https://ai.google.dev/gemini-api/docs/structured-output)
- [Cloudflare local environment variables](https://developers.cloudflare.com/workers/local-development/environment-variables/)
- [Vinext source and documentation](https://github.com/cloudflare/vinext)
- [ALCE citation evaluation paper](https://aclanthology.org/2023.emnlp-main.398/)
- [AgentDojo prompt-injection benchmark](https://arxiv.org/abs/2406.13352)
- [Hackathon overview](https://paypalaihackathon.devpost.com/) and [Official Rules](https://paypalaihackathon.devpost.com/rules), checked 21 October 2026

No DocVQA, FUNSD or other external research dataset is bundled in the demonstration. Such datasets would test extraction or document QA, not validate subjective milestone acceptance.

## Recording ledger

| Item | Source | Current record |
| --- | --- | --- |
| Application footage | Actual ProofPay browser session, 21 October 2026 | `proofpay-capture.webm`; 1440 × 810, 25 fps, 146.6 seconds; synthetic sample workflow |
| Title cards and captions | Original ProofPay wording with Codex assistance | Hyperframes composition; silent walkthrough, no synthetic actor or generated UI footage |
| Subtitle source | `demo.srt` | 14 original English cues aligned to the 165-second composition; final export inspection recorded separately |
| Music and spoken narration | None | Silent video with readable captions |
| Screenshots | Actual local app captures | `screenshots/dashboard.png`, `review-gaps.png`, `client-review.png`, `paid-sample.png`, `mobile.png` |
| Video typography and animation runtime | EB Garamond, JetBrains Mono and GSAP | Font OFL notices and GSAP license header retained in the separate video source package |

The original source is public in [Pradhyut21/proofpay-paypal-ai-hackathon](https://github.com/Pradhyut21/proofpay-paypal-ai-hackathon), with a detected MIT license. Hosted deployment, exported-video inspection and public YouTube publication are tracked independently in `VALIDATION.md`; a local recording does not establish any of them.
