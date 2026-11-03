# Synthetic instruction fixtures

These 20 manifest cards, SVG diagram and PDF were created for TLC tests. They do not contain assets or text copied from LEGO example sites. Card 01 has ten ordered SPIKE steps; card 11 contains an EV3 PDF. The same SVG is reused across synthetic steps to keep the fixture small. Replace these with owner-provided, rights-cleared materials for real lessons.

Use `node tests/fixtures/instructions/seed.mjs` only against a non-production test project after the catalog schema is installed. The seed script must refuse a production target and preserve private media access rules. The 10-card and 20-card subsets support SC-001 and SC-005 checks.
