import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const fixtureDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(fixtureDir, '../../..')
const manifest = JSON.parse(readFileSync(path.join(fixtureDir, 'manifest.json'), 'utf8'))
const countArg = process.argv.find((arg) => arg.startsWith('--count='))
const count = countArg ? Number(countArg.split('=')[1]) : 20
if (![10, 20].includes(count)) throw new Error('Use --count=10 or --count=20')
const instructions = manifest.instructions.slice(0, count)
if (instructions.length !== count || instructions.some((item) => !item.steps.length && !item.document)) {
  throw new Error('Fixture manifest must contain publishable cards')
}
if (!process.argv.includes('--apply')) {
  process.stdout.write(`Dry run: ${count} TLC-owned instruction cards are ready. Pass --apply with test project credentials to seed.\n`)
  process.exit(0)
}

const url = process.env.SUPABASE_TEST_URL
const key = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY
const adminId = process.env.SUPABASE_TEST_ADMIN_ID
const expectedProjectRef = process.env.SUPABASE_TEST_PROJECT_REF
if (!url || !key || !adminId || !expectedProjectRef) {
  throw new Error('Set SUPABASE_TEST_URL, SUPABASE_TEST_PROJECT_REF, SUPABASE_TEST_SERVICE_ROLE_KEY and SUPABASE_TEST_ADMIN_ID')
}
if (!/^[0-9a-f-]{36}$/i.test(adminId)) throw new Error('SUPABASE_TEST_ADMIN_ID must be a user UUID')
const projectUrl = new URL(url)
const projectRef = projectUrl.hostname.split('.')[0]
if (projectUrl.protocol !== 'https:' || !projectUrl.hostname.endsWith('.supabase.co')) {
  throw new Error('SUPABASE_TEST_URL must be an HTTPS Supabase project URL')
}
if (projectRef !== expectedProjectRef) throw new Error('SUPABASE_TEST_PROJECT_REF does not match SUPABASE_TEST_URL')
if (projectRef === 'gayjaicglasjnhmjljzp') throw new Error('Refusing to seed the TLC production project')
const localEnv = readFileSync(path.join(rootDir, '.env.local'), 'utf8')
const configuredUrl = localEnv.match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)?.[1]?.replace(/^['"]|['"]$/g, '').trim()
if (configuredUrl && new URL(url).origin === new URL(configuredUrl).origin) {
  if (!process.argv.includes('--allow-configured-test-project')) {
    throw new Error('This is the configured Supabase project. Add --allow-configured-test-project only after confirming it is a non-production test project.')
  }
}
const supabase = createClient(url, key, { auth: { persistSession: false } })
const upload = async (instructionId, filename, mimeType, objectName = filename) => {
  const objectKey = `fixtures/${instructionId}/${objectName}`
  const bytes = readFileSync(path.join(fixtureDir, filename))
  const { error: uploadError } = await supabase.storage.from('instruction-assets').upload(objectKey, bytes, { contentType: mimeType, upsert: true })
  if (uploadError) throw uploadError
  return { objectKey, byteSize: bytes.length }
}
for (const item of instructions) {
  const { data: card, error: cardError } = await supabase.from('instructions').upsert({
    slug: item.slug, title: item.title, summary: item.summary, kit: item.kit,
    topics: item.topics, status: 'draft', rights_attested_by: adminId,
    rights_attested_at: new Date().toISOString(),
  }, { onConflict: 'slug' }).select('id').single()
  if (cardError || !card) throw cardError || new Error('Instruction insert failed')
  const cover = await upload(card.id, item.cover, 'image/svg+xml')
  const { data: coverAsset, error: coverError } = await supabase.from('instruction_assets').upsert({
    instruction_id: card.id, kind: 'cover', object_key: cover.objectKey,
    mime_type: 'image/svg+xml', byte_size: cover.byteSize,
  }, { onConflict: 'object_key' }).select('id').single()
  if (coverError || !coverAsset) throw coverError || new Error('Cover insert failed')
  let stepAssetId = null
  if (item.steps.length) {
    const stepFile = item.steps[0].asset
    const step = await upload(card.id, stepFile, 'image/svg+xml', `step-${stepFile}`)
    const { data: asset, error } = await supabase.from('instruction_assets').upsert({
      instruction_id: card.id, kind: 'step_image', object_key: step.objectKey,
      mime_type: 'image/svg+xml', byte_size: step.byteSize,
    }, { onConflict: 'object_key' }).select('id').single()
    if (error || !asset) throw error || new Error('Step asset insert failed')
    stepAssetId = asset.id
    const { error: stepsError } = await supabase.from('instruction_steps').upsert(item.steps.map((step) => ({
      instruction_id: card.id, position: step.position, caption: step.caption, asset_id: stepAssetId,
    })), { onConflict: 'instruction_id,position' })
    if (stepsError) throw stepsError
  }
  if (item.document) {
    const bytes = readFileSync(path.join(fixtureDir, item.document))
    const sourceFileId = `tlc-fixture:${item.slug}`
    const source = await supabase.from('instruction_assets')
      .select('id').eq('source_provider', 'google_drive').eq('source_file_id', sourceFileId).maybeSingle()
    if (source.error) throw source.error
    const documentRow = {
      instruction_id: card.id, kind: 'document', object_key: null,
      mime_type: 'application/pdf', byte_size: bytes.length,
      source_provider: 'google_drive', source_file_id: sourceFileId,
      source_revision: 'tlc-fixture-revision-1',
    }
    const { error } = source.data
      ? await supabase.from('instruction_assets').update(documentRow).eq('id', source.data.id)
      : await supabase.from('instruction_assets').insert(documentRow)
    if (error) throw error
  }
  const { error: publishError } = await supabase.from('instructions').update({
    cover_asset_id: coverAsset.id, status: 'published', published_at: new Date().toISOString(),
  }).eq('id', card.id)
  if (publishError) throw publishError
  process.stdout.write(`Seeded ${item.slug}\n`)
}
