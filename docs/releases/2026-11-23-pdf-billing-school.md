# TLC production release — 2026-11-23

## Source and publication

- Full project snapshot committed and pushed before deployment: `2d47504360d38482e8401a6b9fc8ddfa1f52786c` on `main`.
- Scope confirmed: all current changes, including PDF performance, guest dashboard/editor, subscriptions and school management.
- Production Vercel project: `socer-robot-control`; deployment `dpl_DmN8LyPiHLmPheLvnhmebm28ozEo`, status READY.
- Public domains: https://techlabcode.vercel.app and https://socer-robot-control.vercel.app.
- The initial Git push automatically deployed the snapshot. Previous production was temporarily restored while billing dependencies were checked; this release was promoted again after its migration passed test and production verification.

## Database

- `supabase/migrations/20261123190000_subscriptions_and_schools.sql` applied through Supabase MCP as `subscriptions_and_schools` to TLC-test, then TLC production.
- Test database transaction verified Solo activation, duplicate event idempotency, subscription expiry, school activation, school workspace and invitation generation/revocation. All test mutations were rolled back.
- Production verification: seven billing tables; RLS enabled on all; anonymous learning access denied; administrator learning access retained; payment event RPC executable only by service_role.
- Advisor notices remain for RLS tables with no direct-access policies and callable SECURITY DEFINER RPCs; those tables intentionally use restricted RPC access. Auth leaked-password protection is disabled. No global security settings were changed in this release. See [Supabase database advisors](https://supabase.com/docs/guides/database/database-advisors) and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Verification

- Full snapshot: 174 tests and controller hub simulation passed; TypeScript and production build passed.
- PDF component browser harness: five viewport sizes (1366×768, 768×1024, 1024×768, 1024×600, 320×640), rapid navigation, rotation, canvas pixel budget, offline cache and revoked cache access passed without page errors.
- The synthetic 4,009,904-byte PDF with page dictionaries near the beginning displayed its first page after 339,888 bytes. This is a fixture measurement, not a guarantee for every Drive PDF. File layout and upstream range support affect real loading.
- Public production smoke checks passed for `/`, `/login`, `/billing`, `/join`, and the unauthenticated `/instructions` login redirect. No browser page errors.
- `/api/billing/entitlements`: HTTP 200, `migrationPending=false`, anonymous access denied, payment provider `unconfigured`, test mode disabled.
- Production error/fatal log query after publication returned no matching records in its 15-minute window.

## Configuration still required

Production has no `SUPABASE_SERVICE_ROLE_KEY` or CloudPayments configuration. Subscription/school pages and schema are deployed, but real checkout and webhook-driven subscription activation remain unavailable until those server-side credentials are configured. No real payment or authenticated end-to-end school/PDF flow was performed. Test payment mode was not enabled.
