import type { Recipe } from './model'
import type { SharedRecord } from './shared-protocol'

export interface PendingEdit {
  operationId: string
  id: string
  baseRevision: number
  recipe: Recipe | null
  queuedAt: number
}
export interface SyncState {
  version: 1
  connected: boolean
  records: SharedRecord[]
  pending: PendingEdit[]
  privateRecipes: Recipe[]
  seedId?: string
  seedUpdatedAt?: string
}
export interface JournalSnapshot { recipes: Recipe[] | null; sync: SyncState | null }
export interface JournalPersistence {
  load(): Promise<JournalSnapshot>
  save(recipes: Recipe[], state: SyncState | null): Promise<void>
  preservePrivate(recipes: Recipe[]): Promise<void>
}
