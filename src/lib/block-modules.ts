import * as Raw from "../../public/block-modules.js"

export type ModuleId = "pair" | "speed" | "power" | "travel"
export type ModuleBlockType = "drive" | "pair" | "chassis"
export type ModuleIconKey = "gauge" | "zap" | null

export interface ModuleDef {
  id: ModuleId
  label: string
  placement: "base" | "chip"
  icon: ModuleIconKey
  title: string
  description: string
  chip?: { prefix: string; unit: string | null }
  conflicts: readonly ModuleId[]
}

export interface ModuleProblem {
  code: string
  message: string
  short: string
}

export const SPEED_PERCENT_STEP = Raw.SPEED_PERCENT_STEP as number
export const DEFAULT_SPEED_PERCENT = Raw.DEFAULT_SPEED_PERCENT as number
export const MODULE_DEFS = Raw.MODULE_DEFS as Readonly<Record<ModuleId, ModuleDef>>
export const speedToPercent = Raw.speedToPercent as (speed: unknown) => number
export const percentToSpeed = Raw.percentToSpeed as (percent: unknown) => number
export const allowedModules = Raw.allowedModules as (blockType: string) => ModuleId[]
export const moduleMenu = Raw.moduleMenu as (blockType: string) => ModuleDef[]
export const moduleInfo = Raw.moduleInfo as (blockType: string, id: ModuleId) => { title: string; description: string } | null
export const normalizeModules = Raw.normalizeModules as (blockType: string, raw: unknown) => ModuleId[]
export const toggleModule = Raw.toggleModule as (
  blockType: string,
  modules: readonly ModuleId[] | undefined,
  id: ModuleId
) => { modules: ModuleId[]; active: boolean }
export const moduleAddPatch = Raw.moduleAddPatch as (
  blockType: string,
  id: ModuleId,
  block?: { motor?: string }
) => Record<string, unknown>
export const activeModules = Raw.activeModules as (
  blockType: string,
  modules: readonly ModuleId[] | undefined,
  placement?: "base" | "chip"
) => ModuleDef[]
export const validateModuleRules = Raw.validateModuleRules as (
  blockType: string,
  block: unknown,
  options?: { target?: "runtime" | "export" }
) => ModuleProblem[]
