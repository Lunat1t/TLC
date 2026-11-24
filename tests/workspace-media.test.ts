import assert from "node:assert/strict"
import test from "node:test"
import { decodeWorkspaceImage, isWorkspaceMediaUrl, prepareWorkspaceMediaSection, MAX_WORKSPACE_IMAGE_BYTES } from "../src/lib/workspace-media.ts"

const jpeg = "data:image/jpeg;base64,/9j/2Q=="
const url = `/api/workspace-media/${"a".repeat(64)}.jpg`

test("private media references accept only exact same-origin content-addressed paths", () => {
  assert.equal(isWorkspaceMediaUrl(url), true)
  for (const invalid of [`https://evil.test${url}`, `${url}?x=1`, `${url}/more`, `/api/workspace-media/../secret`, `/api/workspace-media/${"a".repeat(64)}.svg`, `//evil.test${url}`]) assert.equal(isWorkspaceMediaUrl(invalid), false)
})
test("image upload validates MIME, magic, base64 and decoded size", () => {
  const result = decodeWorkspaceImage(jpeg)
  assert.equal(result.extension, "jpg")
  assert.equal(result.mime, "image/jpeg")
  assert.deepEqual([...result.bytes], [255,216,255,217])
  for (const invalid of ["data:image/svg+xml;base64,PHN2Zz4=", "data:image/png;base64,/9j/2Q==", "data:image/jpeg;base64,!!!!", "data:image/jpeg;base64,", "https://example.test/pic.jpg"]) assert.throws(() => decodeWorkspaceImage(invalid))
  const huge = `data:image/jpeg;base64,${Buffer.alloc(MAX_WORKSPACE_IMAGE_BYTES + 1).toString("base64")}`
  assert.throws(() => decodeWorkspaceImage(huge), /слишком большое/)
})
test("settings migration replaces only embedded media and preserves all other fields", async () => {
  const source = { wallpaper: jpeg, profilePhoto: jpeg, theme: "dark", extra: { keep: true } }
  const original = structuredClone(source)
  const result = await prepareWorkspaceMediaSection("settings", source, async () => url)
  assert.equal(result.migrated, 2)
  assert.deepEqual(result.value, { ...source, wallpaper: url, profilePhoto: url })
  assert.deepEqual(source, original)
})
test("board migration retains IDs, metadata, external images and notes", async () => {
  let uploads = 0
  const source = [{ id: "one", image: jpeg, color: "blue", x: .5 }, { id: "two", image: "https://example.test/picture.png" }, { id: "note", text: "Preserve this" }]
  const result = await prepareWorkspaceMediaSection("board", source, async () => { uploads++; return url })
  assert.equal(uploads, 1)
  assert.equal(result.migrated, 1)
  assert.deepEqual(result.value, [{ ...source[0], image: url }, source[1], source[2]])
  assert.equal(source[0].image, jpeg)
})
test("partial upload failure never mutates the original section", async () => {
  const source = { wallpaper: jpeg, profilePhoto: jpeg }
  let attempts = 0
  await assert.rejects(prepareWorkspaceMediaSection("settings", source, async () => { if (++attempts === 2) throw Error("offline"); return url }), /offline/)
  assert.deepEqual(source, { wallpaper: jpeg, profilePhoto: jpeg })
})
test("migration is idempotent once all stored images are references", async () => {
  let uploads = 0
  const result = await prepareWorkspaceMediaSection("settings", { wallpaper: url, profilePhoto: "" }, async () => { uploads++; return url })
  assert.equal(result.migrated, 0)
  assert.equal(uploads, 0)
})
test("migration rejects untrusted upload URLs before a caller can persist them", async () => {
  await assert.rejects(prepareWorkspaceMediaSection("settings", { wallpaper: jpeg }, async () => "https://evil.test/picture"), /не подтвердило/)
})
