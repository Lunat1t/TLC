# Synthetic instruction fixtures

These 20 manifest cards, SVG diagram and PDF were created for TLC tests. They do not contain assets or text copied from LEGO example sites. Card 01 has ten ordered SPIKE steps; card 11 contains an EV3 PDF. The same SVG is reused across synthetic steps to keep the fixture small. Replace these with owner-provided, rights-cleared materials for real lessons.

Run `node tests/fixtures/instructions/seed.mjs --count=10` or `--count=20` for a dry run. To apply, set `SUPABASE_TEST_URL`, `SUPABASE_TEST_PROJECT_REF`, `SUPABASE_TEST_SERVICE_ROLE_KEY` and `SUPABASE_TEST_ADMIN_ID`, then pass `--apply`. If the test project is also the app's configured project in `.env.local`, additionally pass `--allow-configured-test-project` after confirming the target is `TLC-test`. The script explicitly refuses the known production project reference. Never place the service-role key in client code or commit it.

The synthetic EV3 PDF is used only to record file size/type and a fake Drive source/revision in the catalog; the bytes are never uploaded to Supabase Storage. That fixture cannot be used for student PDF delivery. The 10-card and 20-card subsets support SC-001 and SC-005 checks.
