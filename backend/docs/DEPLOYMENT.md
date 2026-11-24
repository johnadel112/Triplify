# Free demo deployment

Use one Render Free web service, MongoDB Atlas Free, and Cloudinary Free.
Resend's free HTTPS API handles email on hosts that block SMTP. Stay within each
provider's free quotas; this setup does not provide continuous background execution.
The frontend is still a separate draft and is not deployed by these instructions.

## 1. Configure providers

- Atlas: select **Free**, create a database user for `triplify`, and allow Render's
  service outbound IP ranges in Atlas Network Access. Copy the Drivers connection
  string with `/triplify` as the database. Keep the replica-set Atlas deployment;
  standalone MongoDB does not support the application's transactions.
- Cloudinary: create a free Image and Video API account. Copy the cloud name,
  API key, and API secret from its console to Render's environment variables.
  No unsigned upload preset is needed. The backend signs authenticated uploads.
- Resend: create an API key and verify a domain you control, then use a sender on
  that domain as `MAIL_FROM`. Without a domain, `onboarding@resend.dev` can send
  test mail only to your Resend account email. Domain registration is not included
  in the free plan. For a zero-cost demo without a domain, test using that recipient
  or leave `MAIL_MODE=disabled`; arbitrary-user email will not work in that mode.

## 2. Create the Render web service

Connect GitHub repository `johnadel112/Triplify` and select:

| Setting | Value |
| --- | --- |
| Branch | `main` (after these changes are merged) |
| Root directory | `backend` |
| Runtime | Node |
| Instance type | Free |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm start` |
| Health check path | `/api/health` |

Use the generated `onrender.com` domain. No persistent disk is needed with
Cloudinary. Do not put seed commands in the build/start command.

Set these variables in Render, not in committed files:

```dotenv
NODE_ENV=production
NODE_VERSION=24.22.1
MONGODB_URI=<Atlas URI with database name>
JWT_ACCESS_SECRET=<random secret of at least 32 characters>
FRONTEND_URL=https://<actual frontend origin>
COOKIE_SECURE=true
COOKIE_SAME_SITE=none
MEDIA_STORAGE=cloudinary
CLOUDINARY_CLOUD_NAME=<cloud name>
CLOUDINARY_API_KEY=<API key>
CLOUDINARY_API_SECRET=<API secret>
MAIL_MODE=resend
RESEND_API_KEY=<API key>
MAIL_FROM=Triplify <sender@your-verified-domain>
STRIPE_SECRET_KEY=<sk_test_...>
STRIPE_WEBHOOK_SECRET=<whsec_...>
```

Let Render supply `PORT`. `FRONTEND_URL` accepts exact comma-separated origins;
use your real HTTPS client origin. Use `COOKIE_SAME_SITE=lax` when the frontend and
API are same-site; `none` is for cross-site clients, subject to browser third-party
cookie restrictions. Leave `COOKIE_DOMAIN` unset. The client sends credentials,
an allowed Origin, and `X-Triplify-CSRF: 1` for mutations.

Generate the JWT secret locally:

```sh
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

For initial setup, run `npm run seed:reference` and `npm run seed:admin` from
`backend` on your computer with its ignored `.env` pointing at the intended Atlas
database. Set `ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD`, and `ADMIN_SEED_NAME`
there. Check the database target first. The admin seed must not run on each deploy.
Configure the Stripe test webhook at `https://<backend>/api/payments/webhook`
for `payment_intent.succeeded` and `payment_intent.payment_failed`.

## 3. Verify the deployment

1. Open `/api/health` and confirm `{"status":"ok"}`. Swagger is disabled in production.
2. Register/log in from the configured client origin and verify cookie-based requests.
3. Upload a hotel/blog/activity image or airline logo. Restart/redeploy and verify
   it still loads. Test that a draft/hidden blog image and a private itinerary image
   are denied publicly. The owner/admin activity media route retains its access rules.
4. Request verification/recovery using an allowed email recipient. Allow the next
   queue run (once per minute while awake). Test provider acceptance and actual inbox
   delivery; the frontend must implement the verification/reset landing pages.
5. Complete a Stripe test booking and webhook flow. Live payments remain unsupported.

## Storage and operational limitations

`MEDIA_STORAGE=local` remains supported for development. Cloudinary mode stores
all four image categories as **authenticated** assets under `triplify/<category>`.
Existing API URLs and database image metadata remain unchanged. The API checks
current visibility/ownership before fetching signed images and returns their bytes
with `Cache-Control: private, no-store`. It never redirects to a signed provider URL.
This preserves privacy but consumes both Cloudinary and Render bandwidth.

Switching storage providers does **not** migrate existing local files. For an
existing dataset, preserve the local `backend/uploads` directory and re-upload its
images through the application after switching, or arrange a separate migration
that preserves their IDs. Do not delete local originals until migration is verified.
A fresh demo database avoids this migration requirement.

Uploads are rolled back on batch/database failure; deletes invalidate Cloudinary
copies. Cleanup failures emit a generic warning and can leave orphaned assets
requiring manual cleanup. No durable cleanup retry worker is included.

Render Free sleeps after idle periods. Queued emails, booking expiry, status updates,
and refund reconciliation pause while asleep and resume only when the app runs.
Do not rely on exact scheduling or immediate email delivery. Free-tier limits can
suspend services. Keep Render without a payment method to avoid usage overage charges.

Provider integration tests mock HTTPS responses; actual credentials, inbox delivery,
Cloudinary account configuration, and deployed callbacks require the smoke checks above.

Sources checked November 2026:
[Render Free](https://render.com/docs/free),
[Cloudinary authenticated uploads](https://cloudinary.com/documentation/upload_images),
[Cloudinary signed delivery](https://cloudinary.com/documentation/delivery_url_signatures),
[Resend email API](https://resend.com/docs/api-reference/emails/send-email),
[Resend testing restrictions](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).
