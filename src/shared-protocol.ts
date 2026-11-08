import { makeBackup, parseBackup } from './model.js'
import type { Recipe } from './model.js'

export const PART_BYTES = 192 * 1024
export const MAX_OBJECT_BYTES = 20 * 1024 * 1024
export const PHOTO_PREFIX = 'shared-photo:'
export interface SharedRecord {
  id: string
  revision: number
  hash: string | null
  deleted: boolean
}
export interface ObjectInfo {
  hash: string
  bytes: number
  parts: number
  type: string
}
export interface SharedMutation {
  operationId: string
  id: string
  expectedRevision: number
  hash: string | null
}
export type MutationResult = { ok: true; record: SharedRecord } | { ok: false; record: SharedRecord }
export const validHash = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)

export function photoSlots(recipe: Recipe) {
  return [
    { get: () => recipe.cover, set: (value: string | null) => { recipe.cover = value } },
    ...[...recipe.steps, recipe.baking].map(step => ({
      get: () => step.photo,
      set: (value: string | null) => { step.photo = value },
    })),
  ]
}

// Validate the existing recipe format without accepting arbitrary remote image URLs.
export function validateTransport(value: unknown): Recipe {
  const input = structuredClone(value) as Recipe
  if (!input || typeof input !== 'object' || !Array.isArray(input.steps) || !input.baking)
    throw new Error('레시피 형식을 확인해 주세요.')
  const references: (string | null)[] = []
  for (const slot of photoSlots(input)) {
    const value = slot.get()
    if (value !== null && (typeof value !== 'string' ||
      !value.startsWith(PHOTO_PREFIX) || !validHash(value.slice(PHOTO_PREFIX.length))))
      throw new Error('사진 참조 형식이 올바르지 않아요.')
    references.push(value)
    slot.set(value === null ? null : 'data:image/png;base64,AAAA')
  }
  const normalized = parseBackup(makeBackup([input]))[0]
  photoSlots(normalized).forEach((slot, index) => slot.set(references[index]))
  return normalized
}
