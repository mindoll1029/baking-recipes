import { afterEach, describe, expect, it } from 'vitest'
import { exampleRecipe, uid } from './model'
import type { Recipe } from './model'
import { JournalController } from './journal-controller'
import { SharedClient, contentHash } from './shared-client'
import type { SharedRemote } from './shared-client'
import type { JournalPersistence, JournalSnapshot, SyncState } from './sync-state'
import { MemorySharedStore, memoryFetch } from '../tests/support/shared-memory'
import { PART_BYTES, photoSlots } from './shared-protocol'
import { SharedService } from '../server/shared-service'

class MemoryPersistence implements JournalPersistence {
  snapshot: JournalSnapshot
  backup: Recipe[] | undefined
  fail = false
  constructor(recipes: Recipe[] | null = null) { this.snapshot = { recipes, sync: null } }
  async load() { return structuredClone(this.snapshot) }
  async save(recipes: Recipe[], sync: SyncState | null) {
    if (this.fail) throw new Error('Quota')
    this.snapshot = structuredClone({ recipes, sync })
  }
  async preservePrivate(recipes: Recipe[]) { this.backup ??= structuredClone(recipes) }
}
const controllers: JournalController[] = []
function controller(persistence: MemoryPersistence, remote: SharedRemote) {
  const value = new JournalController(persistence, remote)
  controllers.push(value)
  return value
}
afterEach(() => controllers.splice(0).forEach(value => value.stop()))
async function seed(client: SharedClient, recipe = exampleRecipe()) {
  const hash = await client.write(recipe)
  const result = await client.mutate({ id: recipe.id, operationId: uid(), expectedRevision: 0, hash })
  if (!result.ok) throw new Error('Seed failed')
  return recipe
}

describe('shared object transport', () => {
  it('round-trips a multi-part photo, guidance, tips and recipe metadata', async () => {
    const store = new MemorySharedStore(), client = new SharedClient('/api/shared', memoryFetch(store))
    const recipe = exampleRecipe()
    const image = Buffer.alloc(PART_BYTES * 2 + 31, 7)
    image[0] = 255; image[1] = 216
    recipe.cover = `data:image/jpeg;base64,${image.toString('base64')}`
    recipe.steps[0].photo = recipe.cover
    recipe.baking.preheating = '15분 예열'
    recipe.baking.panPosition = '두 번째 칸'
    recipe.baking.cooling = '식힘망에서 식혀요.'
    await seed(client, recipe)
    const [record] = await client.list()
    expect(await client.read(record)).toEqual(recipe)
    expect([...store.objects.values()].filter(value => value.type.startsWith('image/'))).toHaveLength(1)
    expect([...store.objects.values()].find(value => value.type.startsWith('image/'))?.parts).toBe(3)
  })
  it('rejects missing, tampered and unsafe object payloads before publishing a recipe', async () => {
    const store = new MemorySharedStore(), service = new SharedService(store)
    const bytes = new TextEncoder().encode('not a recipe')
    const hash = await contentHash(bytes)
    await expect(service.finish({ hash, bytes: bytes.length, parts: 1, type: 'application/json' })).rejects.toThrow()
    await service.stage(hash, 0, bytes)
    await expect(service.finish({ hash, bytes: bytes.length, parts: 1, type: 'application/json' })).rejects.toThrow()
    const recipe = exampleRecipe()
    photoSlots(recipe)[0].set('https://outside.invalid/photo.png')
    const body = new TextEncoder().encode(JSON.stringify(recipe)), id = await contentHash(body)
    await service.stage(id, 0, body)
    await expect(service.finish({ hash: id, bytes: body.length, parts: 1, type: 'application/json' })).rejects.toThrow()
    expect(await service.list()).toEqual([])
  })
  it('cannot overwrite already committed image bytes under the same content address', async () => {
    const store = new MemorySharedStore(), service = new SharedService(store)
    const image = Uint8Array.from([255,216,1,2,3]), hash = await contentHash(image)
    await service.stage(hash, 0, image)
    await service.finish({ hash, bytes: image.length, parts: 1, type: 'image/jpeg' })
    await service.stage(hash, 0, Uint8Array.from([255,216,9]))
    expect(new Uint8Array(await service.part(hash, 0))).toEqual(image)
  })
})

describe('durable shared journal', () => {
  it('backs up private browser recipes and requires an explicit action before sharing them', async () => {
    const store = new MemorySharedStore(), remote = new SharedClient('/api/shared', memoryFetch(store))
    const old = exampleRecipe(), persistence = new MemoryPersistence([old])
    const first = controller(persistence, remote)
    await first.start()
    expect(first.getSnapshot().recipes).toEqual([])
    expect(first.getSnapshot().privateRecipes).toEqual([old])
    expect(persistence.backup).toEqual([old])
    expect(await remote.list()).toEqual([])
    first.sharePrivate(); await first.synchronize()
    const second = controller(new MemoryPersistence(), remote)
    await second.start()
    expect(second.getSnapshot().recipes).toEqual([old])
    expect(first.getSnapshot().pendingCount).toBe(0)
  })
  it('preserves offline edits across reload and publishes them when the connection returns', async () => {
    const store = new MemorySharedStore(), request = memoryFetch(store)
    let online = true
    const remote = new SharedClient('/api/shared', async (...args) => {
      if (!online) throw new Error('Offline')
      return request(...args)
    })
    await seed(remote)
    const persistence = new MemoryPersistence(), first = controller(persistence, remote)
    await first.start(); online = false
    first.setRecipes(values => values.map(value => ({ ...value, title: '오프라인 기록' })))
    await first.synchronize(); first.stop()
    const second = controller(persistence, remote)
    await second.start()
    expect(second.getSnapshot().recipes[0].title).toBe('오프라인 기록')
    expect(second.getSnapshot().pendingCount).toBe(1)
    online = true; await second.synchronize()
    expect((await remote.read((await remote.list())[0])).title).toBe('오프라인 기록')
    expect(second.getSnapshot().pendingCount).toBe(0)
  })
  it('retains both versions when devices concurrently edit the same recipe', async () => {
    const store = new MemorySharedStore(), remote = new SharedClient('/api/shared', memoryFetch(store))
    const original = await seed(remote)
    const a = controller(new MemoryPersistence(), remote), b = controller(new MemoryPersistence(), remote)
    await Promise.all([a.start(), b.start()])
    a.setRecipes(values => values.map(value => ({ ...value, title: '기기 A의 기록' })))
    b.setRecipes(values => values.map(value => ({ ...value, title: '기기 B의 기록' })))
    await Promise.all([a.synchronize(), b.synchronize()])
    const records = (await remote.list()).filter(record => !record.deleted)
    const recipes = await Promise.all(records.map(record => remote.read(record)))
    expect(recipes).toHaveLength(2)
    expect(recipes.some(recipe => recipe.title.startsWith('기기 A의 기록'))).toBe(true)
    expect(recipes.some(recipe => recipe.title.startsWith('기기 B의 기록'))).toBe(true)
    expect(recipes.every(recipe => recipe.baking.instructions === original.baking.instructions)).toBe(true)
  })
  it('does not let a stale deletion discard another device’s newer edit', async () => {
    const store = new MemorySharedStore(), remote = new SharedClient('/api/shared', memoryFetch(store))
    await seed(remote)
    const a = controller(new MemoryPersistence(), remote), b = controller(new MemoryPersistence(), remote)
    await Promise.all([a.start(), b.start()])
    a.setRecipes([])
    b.setRecipes(values => values.map(value => ({ ...value, title: '다른 기기의 새 기록' })))
    await b.synchronize(); await a.synchronize()
    expect(a.getSnapshot().recipes[0].title).toBe('다른 기기의 새 기록')
    expect((await remote.list()).filter(record => !record.deleted)).toHaveLength(1)
    a.setRecipes([]); await a.synchronize()
    const third = controller(new MemoryPersistence(), remote); await third.start()
    expect(third.getSnapshot().recipes).toEqual([])
  })
  it('replays a timed-out successful save without duplicate records or revisions', async () => {
    const store = new MemorySharedStore(), request = memoryFetch(store)
    const base = new SharedClient('/api/shared', request)
    await seed(base)
    let interrupt = true
    const remote = new SharedClient('/api/shared', async (input, init) => {
      const response = await request(input, init)
      if (String(input).includes('action=mutate') && interrupt) { interrupt = false; throw new Error('Connection lost after commit') }
      return response
    })
    const state = controller(new MemoryPersistence(), remote); await state.start()
    state.setRecipes(values => values.map(value => ({ ...value, title: '한 번만 저장해요.' })))
    await state.synchronize()
    expect(state.getSnapshot().pendingCount).toBe(1)
    await state.synchronize()
    expect(state.getSnapshot().pendingCount).toBe(0)
    expect(store.revision).toBe(2)
    expect((await remote.list()).filter(record => !record.deleted)).toHaveLength(1)
  })
  it('does not publish an edit when the local durable save has failed', async () => {
    const store = new MemorySharedStore(), remote = new SharedClient('/api/shared', memoryFetch(store))
    const original = await seed(remote), persistence = new MemoryPersistence()
    const state = controller(persistence, remote); await state.start()
    persistence.fail = true
    state.setRecipes(values => values.map(value => ({ ...value, title: '아직 기기에 못 쓴 기록' })))
    await state.synchronize()
    expect((await remote.read((await remote.list())[0])).title).toBe(original.title)
    expect(state.getSnapshot().saveState).toBe('error')
  })
  it('keeps keystrokes made during an in-flight save without creating a conflict copy', async () => {
    const store = new MemorySharedStore(), remote = new SharedClient('/api/shared', memoryFetch(store))
    await seed(remote)
    let release!: () => void
    let entered!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const started = new Promise<void>(resolve => { entered = resolve })
    let pause = true
    const delayed: SharedRemote = { list: () => remote.list(), read: record => remote.read(record),
      write: recipe => remote.write(recipe), mutate: async input => {
        if (pause) { pause = false; entered(); await gate }
        return remote.mutate(input)
      } }
    const state = controller(new MemoryPersistence(), delayed); await state.start()
    state.setRecipes(values => values.map(value => ({ ...value, title: '첫 입력' })))
    const sending = state.synchronize()
    await started
    state.setRecipes(values => values.map(value => ({ ...value, title: '전송 중 추가한 입력' })))
    release(); await sending
    const records = (await remote.list()).filter(record => !record.deleted)
    expect(records).toHaveLength(1)
    expect((await remote.read(records[0])).title).toBe('전송 중 추가한 입력')
    expect(state.getSnapshot().pendingCount).toBe(0)
  })
  it('does not erase the cached journal when a server download fails', async () => {
    const store = new MemorySharedStore(), remote = new SharedClient('/api/shared', memoryFetch(store))
    const original = await seed(remote), persistence = new MemoryPersistence()
    const first = controller(persistence, remote); await first.start(); first.stop()
    const broken: SharedRemote = { list: () => remote.list(), read: async () => { throw new Error('Missing photo') },
      write: value => remote.write(value), mutate: value => remote.mutate(value) }
    store.records.get(original.id)!.revision++
    const second = controller(persistence, broken); await second.start()
    expect(second.getSnapshot().recipes).toEqual([original])
    expect(second.getSnapshot().syncStatus).toBe('offline')
  })
})
