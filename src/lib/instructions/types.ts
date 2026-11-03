export type Kit = "spike" | "ev3"
export type InstructionStatus = "draft" | "published" | "archived"
export type LaunchStatus = "pending" | "opened" | "completed" | "closed" | "superseded"
export type SelectionStatus = "awaiting_launch" | "launched"

export interface Instruction {
  id: string
  slug: string
  title: string
  summary: string
  kit: Kit
  topics: string[]
  status: InstructionStatus
  cover_asset_id: string | null
  rights_attested_by: string | null
  rights_attested_at: string | null
  published_at: string | null
  updated_at: string
}

export interface InstructionStep {
  id: string
  instruction_id: string
  position: number
  caption: string
  asset_id: string | null
}

export interface InstructionAsset {
  id: string
  instruction_id: string
  kind: "cover" | "step_image" | "document"
  object_key: string
  mime_type: string
  byte_size: number
  created_at: string
}

export interface StudentSession {
  id: string
  student_id: string
  auth_session_id: string
  generation: number
  last_seen_at: string
  started_at: string
  ended_at: string | null
}

export interface StudentSelection {
  student_id: string
  instruction_id: string | null
  selection_version: number
  selected_at: string | null
  status: SelectionStatus
}

export interface LaunchStep {
  id: string
  position: number
  caption: string
  assetId: string | null
}

export interface LaunchSnapshot {
  title: string
  kit: Kit
  steps: LaunchStep[]
  documentAssetId: string | null
  assetIds: string[]
}

export interface AssemblyLaunch {
  id: string
  student_id: string
  created_for_session_id: string
  instruction_id: string
  selection_version: number
  instruction_snapshot: LaunchSnapshot
  admin_id: string
  idempotency_key: string
  status: LaunchStatus
  created_at: string
  opened_at: string | null
  ended_at: string | null
}

export interface AssemblyProgress {
  launch_id: string
  current_step: number
  completed_step_ids: string[]
  version: number
  updated_at: string
}

export interface CatalogCard {
  id: string
  slug: string
  title: string
  summary: string
  kit: Kit
  topics: string[]
  coverAssetId: string | null
}
