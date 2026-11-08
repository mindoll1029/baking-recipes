import { copyWithNewIds, exampleRecipe, uid } from './model'
import type { Recipe } from './model'
import type { SharedRemote } from './shared-client'
import type { SharedRecord } from './shared-protocol'
import type { JournalPersistence, PendingEdit, SyncState } from './sync-state'

export type SyncStatus = 'connecting' | 'shared' | 'pending' | 'offline'
export interface JournalView {
  recipes: Recipe[]
  ready: boolean
  saveState: 'loading' | 'saving' | 'saved' | 'error'
  error: string
  syncStatus: SyncStatus
  shared: boolean
  pendingCount: number
  privateRecipes: Recipe[]
  notice: string
}
const emptySync = (): SyncState => ({ version: 1, connected: false, records: [], pending: [], privateRecipes: [] })

export class JournalController {
  private recipes: Recipe[] = []
  private state = emptySync()
  private view: JournalView = { recipes: [], ready: false, saveState: 'loading', error: '',
    syncStatus: 'connecting', shared: false, pendingCount: 0, privateRecipes: [], notice: '' }
  private listeners = new Set<() => void>()
  private tail: Promise<void> = Promise.resolve()
  private saveRevision = 0
  private generation = 0
  private running = false
  private sending: string | null = null
  private writable = false
  private active = false
  private timer: ReturnType<typeof setTimeout> | undefined
  constructor(private persistence: JournalPersistence, private remote: SharedRemote) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  getSnapshot = () => this.view
  private emit(patch: Partial<JournalView> = {}) {
    this.view = { ...this.view, ...patch, recipes: this.recipes, shared: this.state.connected,
      pendingCount: this.state.pending.length, privateRecipes: this.state.privateRecipes }
    for (const listener of this.listeners) listener()
  }
  private async persist(): Promise<void> {
    if (!this.writable) return
    const revision = ++this.saveRevision
    const recipes = this.recipes
    const state = structuredClone(this.state)
    this.emit({ saveState: 'saving' })
    const job = this.tail.then(() => this.persistence.save(recipes, state))
    this.tail = job.then(() => {}, () => {})
    try {
      await job
      if (revision === this.saveRevision) this.emit({ saveState: 'saved', error: '' })
    } catch {
      if (revision === this.saveRevision) this.emit({ saveState: 'error',
        error: '브라우저에 저장하지 못했어요. 작성한 화면을 닫지 말고 브라우저의 저장 공간을 확인해 주세요.' })
      throw new Error('기기 저장을 완료하지 못했어요.')
    }
  }
  async start() {
    this.active = true
    const generation = ++this.generation
    try {
      const snapshot = await this.persistence.load()
      if (generation !== this.generation) return
      this.state = snapshot.sync ?? emptySync()
      this.recipes = snapshot.recipes ?? []
      if (this.state.connected) {
        const recovered = new Map(this.recipes.map(recipe => [recipe.id, recipe]))
        for (const edit of this.state.pending) {
          if (edit.recipe) recovered.set(edit.id, edit.recipe)
          else recovered.delete(edit.id)
        }
        const values = [...recovered.values()]
        this.recipes = values.slice(0, 500)
        if (values.length > 500) {
          this.state.privateRecipes.push(...values.slice(500))
          const visible = new Set(this.recipes.map(recipe => recipe.id))
          this.state.pending = this.state.pending.filter(edit => edit.recipe === null || visible.has(edit.id))
        }
      }
      this.writable = true
      this.emit({ ready: snapshot.recipes !== null || this.state.connected,
        saveState: 'saved', syncStatus: 'connecting' })
      if (snapshot.recipes !== null) await this.persist()
      await this.synchronize()
    } catch {
      if (generation !== this.generation) return
      this.writable = false
      this.emit({ ready: true, saveState: 'error', error: '저장된 기록을 불러올 수 없어요. 기존 기록을 보호하기 위해 자동 저장을 멈췄어요. 다른 탭을 닫거나 브라우저의 저장 권한을 확인한 뒤 새로고침해 주세요.' })
    }
  }
  stop() {
    this.active = false
    ++this.generation
    this.running = false
    if (this.timer) clearTimeout(this.timer)
  }
  private schedule() {
    if (!this.active) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => { void this.synchronize() }, 700)
  }
  setRecipes = (action: Recipe[] | ((recipes: Recipe[]) => Recipe[])) => {
    const previous = this.recipes
    const next = typeof action === 'function' ? action(previous) : action
    if (next === previous) return
    if (next.length > 500) {
      this.emit({ notice: '한 번에 보관할 수 있는 레시피는 500개예요. 사용하지 않는 공유 기록을 정리해 주세요.' })
      return
    }
    if (this.state.connected) {
      const before = new Map(previous.map(recipe => [recipe.id, recipe]))
      const after = new Map(next.map(recipe => [recipe.id, recipe]))
      for (const id of new Set([...before.keys(), ...after.keys()])) {
        if (before.get(id) === after.get(id)) continue
        const existing = this.state.pending.find(edit => edit.id === id && edit.operationId !== this.sending)
        const change: PendingEdit = { id, operationId: uid(), queuedAt: Date.now(), recipe: after.get(id) ?? null,
          baseRevision: existing?.baseRevision ?? this.state.records.find(record => record.id === id)?.revision ?? 0 }
        if (existing) this.state.pending = this.state.pending.map(edit => edit === existing ? change : edit)
        else this.state.pending = [...this.state.pending, change]
      }
    }
    this.recipes = next
    this.emit({ syncStatus: this.state.connected ? 'pending' : this.view.syncStatus })
    void this.persist().then(() => this.schedule(), () => {})
  }
  sharePrivate = () => {
    if (!this.state.connected || !this.state.privateRecipes.length) return
    const additions: Recipe[] = []
    const remaining: Recipe[] = []
    for (const recipe of this.state.privateRecipes) {
      const prior = this.recipes.find(item => item.id === recipe.id)
      if (prior && JSON.stringify(prior) === JSON.stringify(recipe)) continue
      if (this.recipes.length + additions.length >= 500) { remaining.push(recipe); continue }
      if (this.state.records.some(record => record.id === recipe.id)) {
        const copy = copyWithNewIds(recipe)
        copy.title = `${recipe.title || '이름 없는 레시피'} (기기 기록)`.slice(0, 120)
        additions.push(copy)
      } else additions.push(recipe)
    }
    this.state.privateRecipes = remaining
    if (additions.length) this.setRecipes([...additions, ...this.recipes])
    else { this.emit(); void this.persist().catch(() => {}) }
    this.emit({ notice: remaining.length ? '공유 공간이 가득 차 일부 기기 기록은 계속 보관하고 있어요. 기기 기록은 그대로 보관하고 있어요.'
      : '기기 기록을 공유에 추가했어요. 다른 방문자도 보고 수정할 수 있어요.' })
  }
  dismissNotice = () => this.emit({ notice: '' })
  private async activate(records: SharedRecord[], generation: number) {
    const shared: Recipe[] = []
    for (const record of records) if (!record.deleted) shared.push(await this.remote.read(record))
    if (generation !== this.generation) return
    const privateRecords = this.recipes.filter(recipe =>
      recipe.id !== this.state.seedId || recipe.updatedAt !== this.state.seedUpdatedAt)
    await this.persistence.preservePrivate(privateRecords)
    if (generation !== this.generation) return
    const latest = this.recipes.filter(recipe => recipe.id !== this.state.seedId || recipe.updatedAt !== this.state.seedUpdatedAt)
    this.state = { ...this.state, connected: true, records, pending: [], privateRecipes: latest }
    this.recipes = shared.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    this.emit({ ready: true })
    await this.persist()
  }
  private async pull(records: SharedRecord[], generation: number) {
    const known = new Map(this.state.records.map(record => [record.id, record]))
    const dirtyBefore = new Set(this.state.pending.map(edit => edit.id))
    const incoming = new Map<string, Recipe>()
    for (const record of records) {
      if (!record.deleted && !dirtyBefore.has(record.id) &&
        (known.get(record.id)?.revision !== record.revision || !this.recipes.some(recipe => recipe.id === record.id)))
        incoming.set(record.id, await this.remote.read(record))
    }
    if (generation !== this.generation) return
    const dirty = new Set(this.state.pending.map(edit => edit.id))
    const merged = new Map(this.recipes.map(recipe => [recipe.id, recipe]))
    const seen = new Set(records.map(record => record.id))
    for (const record of records) {
      if (dirty.has(record.id)) continue
      if (record.deleted) merged.delete(record.id)
      else if (incoming.has(record.id)) merged.set(record.id, incoming.get(record.id)!)
    }
    for (const id of merged.keys()) if (!seen.has(id) && !dirty.has(id)) merged.delete(id)
    const next = [...merged.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    if (next.length > 500) {
      this.emit({ notice: '공유 기록과 대기 중인 기기 기록이 500개를 넘었어요. 기기 기록은 보관됩니다. 공유 공간을 정리해 주세요.' })
      throw new Error('Shared recipe limit')
    }
    const baseline = [...records.filter(record => !dirty.has(record.id)),
      ...this.state.records.filter(record => dirty.has(record.id))]
    if (next.length !== this.recipes.length || next.some((recipe, index) => recipe !== this.recipes[index]) ||
      JSON.stringify(baseline) !== JSON.stringify(this.state.records)) {
      this.recipes = next
      this.state.records = baseline
      this.emit()
      await this.persist()
    }
  }
  private acknowledge(edit: PendingEdit, record: SharedRecord) {
    this.state.records = [...this.state.records.filter(value => value.id !== record.id), record]
    this.state.pending = this.state.pending.filter(value => value.operationId !== edit.operationId)
      .map(value => value.id === edit.id ? { ...value, baseRevision: record.revision } : value)
  }
  private async conflict(edit: PendingEdit, record: SharedRecord, generation: number) {
    const remote = record.deleted ? null : await this.remote.read(record)
    if (generation !== this.generation) return
    const latest = this.recipes.find(recipe => recipe.id === edit.id)
    this.state.pending = this.state.pending.filter(value => value.id !== edit.id)
    this.state.records = [...this.state.records.filter(value => value.id !== edit.id), record]
    this.recipes = this.recipes.filter(recipe => recipe.id !== edit.id)
    if (remote) this.recipes.push(remote)
    if (latest) {
      const fork = copyWithNewIds(latest)
      fork.title = `${latest.title || '이름 없는 레시피'} (동시 편집 복사본)`.slice(0, 120)
      if (this.recipes.length < 500) {
        this.recipes.unshift(fork)
        this.state.pending.push({ id: fork.id, operationId: uid(), queuedAt: Date.now(), baseRevision: 0, recipe: fork })
        this.emit({ notice: '같은 레시피가 다른 기기에서도 바뀌어 두 기록을 모두 남겼어요.' })
      } else {
        this.state.privateRecipes.push(fork)
        this.emit({ notice: '동시에 편집한 내용을 기기 기록으로 보관했어요. 공유 공간을 정리한 뒤 추가할 수 있어요.' })
      }
    } else this.emit({ notice: remote ? '다른 기기에서 수정된 기록이라 삭제하지 않고 남겼어요.' : '' })
  }
  private ensureLocalSaved() {
    if (this.view.saveState === 'error') throw new Error('기기 저장을 먼저 완료해 주세요.')
  }
  synchronize = async () => {
    if (this.running || !this.writable || !this.active) return
    this.running = true
    const generation = this.generation
    try {
      await this.tail
      this.ensureLocalSaved()
      const records = await this.remote.list()
      if (generation !== this.generation) return
      if (!this.state.connected) await this.activate(records, generation)
      else await this.pull(records, generation)
      while (this.state.pending.length && generation === this.generation) {
        const edit = this.state.pending[0]
        this.sending = edit.operationId
        this.emit({ syncStatus: 'pending' })
        await this.tail
        this.ensureLocalSaved()
        const hash = edit.recipe ? await this.remote.write(edit.recipe) : null
        const result = await this.remote.mutate({ operationId: edit.operationId, id: edit.id,
          expectedRevision: edit.baseRevision, hash })
        if (generation !== this.generation) return
        if (result.ok) this.acknowledge(edit, result.record)
        else await this.conflict(edit, result.record, generation)
        this.sending = null
        this.emit()
        await this.persist()
      }
      if (generation === this.generation) this.emit({ syncStatus: 'shared' })
    } catch {
      if (generation !== this.generation) return
      if (!this.view.ready) {
        const seed = exampleRecipe()
        this.recipes = [seed]
        this.state.seedId = seed.id
        this.state.seedUpdatedAt = seed.updatedAt
        this.emit({ ready: true })
        await this.persist().catch(() => {})
      }
      this.emit({ syncStatus: 'offline' })
    } finally {
      if (generation === this.generation) {
        this.running = false
        this.sending = null
        if (this.state.pending.length && this.view.syncStatus !== 'offline') this.schedule()
      }
    }
  }
}
