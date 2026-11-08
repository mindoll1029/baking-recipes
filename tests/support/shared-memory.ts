import type { MutationResult, ObjectInfo, SharedMutation, SharedRecord } from '../../src/shared-protocol'
import type { SharedStore } from '../../server/shared-store'
import { SharedService, SharedRequestError } from '../../server/shared-service'

// A deterministic store for protocol and browser tests, never a production fallback.
export class MemorySharedStore implements SharedStore {
  records = new Map<string, SharedRecord>()
  objects = new Map<string, ObjectInfo>()
  parts = new Map<string, string>()
  operations = new Map<string, MutationResult>()
  revision = 0
  async list() { return structuredClone([...this.records.values()]) }
  async objectInfo(hash: string) { return structuredClone(this.objects.get(hash) ?? null) }
  async objectPart(hash: string, part: number) { return this.parts.get(`${hash}:${part}`) ?? null }
  async stagePart(hash: string, part: number, base64: string) {
    if (this.objects.has(hash)) return
    const key = `${hash}:${part}`
    const prior = this.parts.get(key)
    if (prior !== undefined && prior !== base64) throw new Error('PART_CONFLICT')
    this.parts.set(key, base64)
  }
  async finishObject(info: ObjectInfo) { this.objects.set(info.hash, structuredClone(info)) }
  async mutate(input: SharedMutation): Promise<MutationResult> {
    const prior = this.operations.get(input.operationId)
    if (prior) return structuredClone(prior)
    const current = this.records.get(input.id) ?? { id: input.id, revision: 0, hash: null, deleted: true }
    if (input.hash === null && current.deleted) return { ok: true, record: structuredClone(current) }
    if (current.revision !== input.expectedRevision) return { ok: false, record: structuredClone(current) }
    const record = { id: input.id, revision: ++this.revision, hash: input.hash, deleted: input.hash === null }
    this.records.set(input.id, record)
    const result = { ok: true as const, record }
    this.operations.set(input.operationId, result)
    return structuredClone(result)
  }
}
export function memoryFetch(store: MemorySharedStore): typeof fetch {
  const service = new SharedService(store)
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'https://shared.test')
    const request = new Request(url, init)
    const action = url.searchParams.get('action')
    const hash = url.searchParams.get('hash') ?? ''
    const part = Number(url.searchParams.get('part'))
    const json = (value: unknown, status = 200) => Response.json(value, { status })
    try {
      if (action === 'manifest') return json({ shared: true, records: await service.list() })
      if (action === 'object-info') return json({ object: await service.info(hash) })
      if (action === 'object-part' && request.method === 'GET') {
        const bytes = await service.part(hash, part)
        return new Response(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
      }
      if (action === 'object-part' && request.method === 'PUT') {
        await service.stage(hash, part, new Uint8Array(await request.arrayBuffer()))
        return json({ ok: true })
      }
      if (action === 'object-commit') { await service.finish(await request.json() as ObjectInfo); return json({ ok: true }) }
      if (action === 'mutate') {
        const result = await service.mutate(await request.json() as SharedMutation)
        return json(result, result.ok ? 200 : 409)
      }
      return json({ error: 'Not found' }, 404)
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Failed' }, error instanceof SharedRequestError ? error.status : 503)
    }
  }
}
