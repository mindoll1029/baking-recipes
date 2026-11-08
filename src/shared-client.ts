import { makeBackup, parseBackup } from './model'
import type { Recipe } from './model'
import { MAX_OBJECT_BYTES, PART_BYTES, PHOTO_PREFIX, photoSlots, validateTransport } from './shared-protocol'
import type { MutationResult, ObjectInfo, SharedMutation, SharedRecord } from './shared-protocol'

export interface SharedRemote {
  list(): Promise<SharedRecord[]>
  read(record: SharedRecord): Promise<Recipe>
  write(recipe: Recipe): Promise<string>
  mutate(input: SharedMutation): Promise<MutationResult>
}
export async function contentHash(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}
function base64(bytes: Uint8Array) {
  let text = ''
  for (let offset = 0; offset < bytes.length; offset += 8192)
    text += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  return btoa(text)
}
export class SharedClient implements SharedRemote {
  private uploaded = new Set<string>()
  private photos = new Map<string, Promise<string>>()
  private encodedPhotos = new Map<string, Promise<string>>()
  constructor(private endpoint = '/api/shared', private request: typeof fetch = (...args) => fetch(...args)) {}
  private async call<T>(query: string, init?: RequestInit): Promise<T> {
    const response = await this.request(this.endpoint + query, { ...init, signal: init?.signal ?? AbortSignal.timeout(30000) })
    const data = await response.json() as T & { error?: string }
    if (!response.ok) throw new Error(data.error || '서버와 연결하지 못했어요. 기기 기록은 보관됩니다.')
    return data
  }
  private post<T>(query: string, value: unknown) {
    return this.call<T>(query, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) })
  }
  async list() {
    const result = await this.call<{ records: SharedRecord[] | null; shared: boolean }>('?action=manifest', { cache: 'no-store', signal: AbortSignal.timeout(5000) })
    if (!result.shared || !Array.isArray(result.records)) throw new Error('서버 응답을 확인하지 못했어요.')
    return result.records
  }
  async mutate(input: SharedMutation): Promise<MutationResult> {
    const response = await this.request(this.endpoint + '?action=mutate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
      signal: AbortSignal.timeout(30000),
    })
    const value = await response.json() as MutationResult & { error?: string }
    if (response.status !== 409 && !response.ok) throw new Error(value.error || '서버 저장을 완료하지 못했어요.')
    if (!value.record || typeof value.ok !== 'boolean') throw new Error('서버 응답을 확인하지 못했어요.')
    return value
  }
  private async put(bytes: Uint8Array, type: string): Promise<string> {
    if (bytes.length > MAX_OBJECT_BYTES) throw new Error('레시피 파일이 너무 커서 서버에 보관하지 못했어요. 기기 기록은 그대로 보관됩니다.')
    const hash = await contentHash(bytes)
    if (this.uploaded.has(hash)) return hash
    const prior = await this.call<{ object: ObjectInfo | null }>(`?action=object-info&hash=${hash}`)
    if (!prior.object) {
      const parts = Math.ceil(bytes.length / PART_BYTES)
      for (let index = 0; index < parts; index++) {
        await this.call(`?action=object-part&hash=${hash}&part=${index}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' },
          body: bytes.slice(index * PART_BYTES, (index + 1) * PART_BYTES).buffer,
        })
      }
      await this.post('?action=object-commit', { hash, bytes: bytes.length, parts, type })
    }
    this.uploaded.add(hash)
    return hash
  }
  private async get(hash: string): Promise<{ bytes: Uint8Array; type: string }> {
    const { object } = await this.call<{ object: ObjectInfo | null }>(`?action=object-info&hash=${hash}`)
    if (!object || object.bytes > MAX_OBJECT_BYTES || object.parts !== Math.ceil(object.bytes / PART_BYTES))
      throw new Error('서버 파일을 읽지 못했어요.')
    const bytes = new Uint8Array(object.bytes)
    for (let index = 0; index < object.parts; index++) {
      const response = await this.request(`${this.endpoint}?action=object-part&hash=${hash}&part=${index}`, {
        signal: AbortSignal.timeout(30000),
      })
      if (!response.ok) throw new Error('사진이나 레시피를 내려받지 못했어요.')
      const part = new Uint8Array(await response.arrayBuffer())
      if (part.length !== Math.min(PART_BYTES, object.bytes - index * PART_BYTES))
        throw new Error('서버 파일의 일부가 빠져 있어요. 다시 시도해 주세요.')
      bytes.set(part, index * PART_BYTES)
    }
    if (await contentHash(bytes) !== hash) throw new Error('내려받은 파일을 확인하지 못했어요.')
    return { bytes, type: object.type }
  }
  private encodePhoto(value: string): Promise<string> {
    let promise = this.encodedPhotos.get(value)
    if (!promise) {
      promise = (async () => {
        const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(value)
        if (!match) throw new Error('사진 형식을 확인해 주세요.')
        const text = atob(match[2])
        const bytes = Uint8Array.from(text, character => character.charCodeAt(0))
        const hash = await this.put(bytes, match[1])
        this.photos.set(hash, Promise.resolve(value))
        return PHOTO_PREFIX + hash
      })()
      this.encodedPhotos.set(value, promise)
      void promise.catch(() => this.encodedPhotos.delete(value))
    }
    return promise
  }
  async write(recipe: Recipe): Promise<string> {
    const transport = structuredClone(recipe)
    for (const slot of photoSlots(transport)) {
      const value = slot.get()
      if (value !== null) slot.set(await this.encodePhoto(value))
    }
    const normalized = validateTransport(transport)
    return this.put(new TextEncoder().encode(JSON.stringify(normalized)), 'application/json')
  }
  async read(record: SharedRecord): Promise<Recipe> {
    if (record.deleted || !record.hash) throw new Error('삭제된 레시피예요.')
    const object = await this.get(record.hash)
    if (object.type !== 'application/json') throw new Error('레시피 형식을 확인해 주세요.')
    const recipe = validateTransport(JSON.parse(new TextDecoder().decode(object.bytes)))
    if (recipe.id !== record.id) throw new Error('레시피 ID가 일치하지 않아요.')
    for (const slot of photoSlots(recipe)) {
      const reference = slot.get()
      if (reference) {
        const hash = reference.slice(PHOTO_PREFIX.length)
        let photo = this.photos.get(hash)
        if (!photo) {
          photo = this.get(hash).then(({ bytes, type }) => {
            if (!/^image\/(jpeg|png|webp)$/.test(type)) throw new Error('사진 형식을 확인해 주세요.')
            return `data:${type};base64,${base64(bytes)}`
          })
          this.photos.set(hash, photo)
          void photo.catch(() => this.photos.delete(hash))
        }
        slot.set(await photo)
      }
    }
    return parseBackup(makeBackup([recipe]))[0]
  }
}
