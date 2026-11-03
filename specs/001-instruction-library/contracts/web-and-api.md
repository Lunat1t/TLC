# Web and API contracts

All paths are relative to the TLC origin. Authenticated calls use a verified Supabase identity; student assembly calls additionally require the current active-tablet lease. JSON errors have `{ "error": { "code": string, "message": string } }`. Server time is authoritative. No service-role key reaches the browser. Protected steps/files and student-specific responses use `Cache-Control: private, no-store`.

## Pages

| Route | Audience | Behavior |
| --- | --- | --- |
| `/instructions?kit=spike|ev3&q=...` | guest, student, admin | Catalog; filter/search in URL; empty/loading/error states |
| `/instructions/[slug]` | guest, student, admin | Published card/description only; student can select for lesson; no steps or document before launch |
| `/assembly/[launchId]` | addressed student on current tablet | Guided workspace with steps/document and saved progress; old tablet and others denied |
| `/admin/instructions` | admin | Draft/published list, editing, uploads and publication |
| `/admin/students` | admin | Current student roster, selected instructions, launch status and launch action |
| `/login` | student and admin | Public sign-in with a working teacher entry; never nested under guarded `/admin` layout |

## Catalog and media

- `GET /api/instructions?kit=&q=&cursor=` returns only published card metadata: `{ items: [{ id, slug, title, summary, kit, topics, coverAssetId }], nextCursor }`. Search is case insensitive; pagination order is stable. No ordered steps, step captions or document URLs are included.
- `GET /api/instructions/:slug` returns a published card/description and selection affordance only. Draft/archived return `404` to non-admin users; even for published instructions it does not expose steps, document references or storage keys.
- `GET /api/instruction-media/:instructionId/:assetId` serves only a cover for a currently published card, or an admin-authorized editorial asset. `GET /api/student/launches/:id/materials` returns the immutable ordered step/document snapshot only for an `opened` launch addressed to the student on the current tablet. `GET /api/student/launches/:id/media/:assetId` streams a step image/PDF only if the asset belongs to that opened launch snapshot. Return `404` for unrelated assets, `403` for a known asset without an active grant, `409 stale_device` for an old tablet, and `503` if Storage is unavailable. Support PDF range requests or a safe document fallback. Protected responses use `Cache-Control: private, no-store` and no public/signed object URL.
- Archiving removes catalog/preview/cover access and prevents a fresh launch. An already `opened` launch retains access to its pinned materials until `completed` or `closed`, including after a current-tablet handoff. A merely `pending` launch cannot newly open after archive; it is marked `superseded` and the administrator sees that state.

## Student selection and session

- `POST /api/student/session/activate` is called after a confirmed new sign-in. It checks the caller's Auth session is the latest verified session for that student, atomically retires the previous device lease and returns `{ sessionId, generation, onlineUntil }`. It does not delete the student's pending/opened launch or progress. An old Auth token cannot activate again by heartbeat.
- `POST /api/student/session/heartbeat` accepts `{ sessionId, generation }`; refreshes only the current active lease and returns `{ serverTime, onlineUntil }`. Old/retired leases return `409 stale_device` and cannot reclaim activity. Closing attempts a best-effort lease end; expiration makes the roster offline without deleting a pending launch.
- `PUT /api/student/selection` accepts `{ sessionId, generation, instructionId }`; validates current lease and published instruction, increments the student's `selectionVersion`, and returns `{ instructionId, selectionVersion, selectedAt, status: "awaiting_launch" }`. If a launch is `opened`, the same transaction saves its progress, marks it `closed` and creates the new waiting selection. A prior `pending` launch becomes `superseded`.
- `GET /api/student/launches/current?sessionId=&generation=` returns the student's pending/opened launch and saved progress only for the current tablet. Call on first load, reconnect, foreground and device activation. Realtime is a notification; the stored row is authoritative.
- `POST /api/student/launches/:id/open` acknowledges opening after safe navigation; `POST /api/student/launches/:id/close` records closure or completion. Progress reads/writes require the current lease generation and a progress version; stale-device/version writes fail without changing saved progress. Repeated acknowledgements are idempotent. Closed/completed/superseded launches grant no material access.

## Admin roster and launch

- `GET /api/admin/students/active` returns only to an authenticated admin `{ students: [{ studentId, sessionId, generation, nickname, onlineUntil, selectedInstruction: { id, title, kit } | null, selectionVersion, launchStatus }] }`. Exactly one currently active row per student appears. `launchStatus` is `pending|opened|completed|closed|superseded` (or `null`). Other users receive `403`.
- `POST /api/admin/launches` accepts `{ studentId, sessionId, expectedGeneration, expectedSelectionVersion, idempotencyKey }`. Server atomically verifies admin role, current online tablet, published selected instruction and matching version; it pins an immutable material snapshot and creates one student-owned launch. Returns `201` with `{ launchId, instructionId, status: "pending" }`; replay of the same key returns the same result. Missing choice returns `409 selection_required`, changed choice returns `409 selection_changed`, replaced tablet returns `409 stale_device`, expired session returns `409 student_offline`, unauthorized caller returns `403`.
- Admin UI subscribes to permitted changes in student sessions and launches, and refetches roster after reconnect. Student UI subscribes only to its own launches. Database RLS and server checks both enforce these scopes.

## Editor publication

- Admin writes drafts and uploads images/PDF to a private bucket through authenticated server actions/routes. Validation covers MIME/type, size, filename/object key, instruction ownership and rights attestation.
- Publishing validates the requirements in `spec.md` and atomically changes card visibility. Editing or archiving an instruction preserves the pinned content/assets of already opened launches; replacement assets stay available until those launches end. Archiving supersedes pending launches that have not opened.
- Admin provisioning is performed through a trusted operator action, never through a public signup field or mutable profile field.
