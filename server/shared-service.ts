import { createHash } from 'node:crypto'
import { MAX_OBJECT_BYTES, PART_BYTES, PHOTO_PREFIX, photoSlots, validHash, validateTransport } from '../src/shared-protocol.js'
import type { ObjectInfo, SharedMutation } from '../src/shared-protocol.js'
import type { SharedStore } from './shared-store.js'

export class SharedRequestError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new SharedRequestError(message)
}
export class SharedService {
  constructor(private store: SharedStore) {}
  list() { return this.store.list() }
  info(hash: string) {
    assert(validHash(hash), '파일 주소를 확인해 주세요.')
    return this.store.objectInfo(hash)
  }
  async part(hash: string, index: number) {
    assert(validHash(hash) && Number.isInteger(index) && index >= 0 && index < 110, '파일 조각을 확인해 주세요.')
    const meta = await this.store.objectInfo(hash)
    if (!meta || index >= meta.parts) throw new SharedRequestError('파일을 찾지 못했어요.', 404)
    const raw = await this.store.objectPart(hash, index)
    if (raw === null) throw new SharedRequestError('파일을 읽지 못했어요.', 503)
    return Buffer.from(raw, 'base64')
  }
  async stage(hash: string, index: number, raw: Uint8Array) {
    assert(validHash(hash) && Number.isInteger(index) && index >= 0 && index < 110, '파일 조각을 확인해 주세요.')
    assert(raw.byteLength > 0 && raw.byteLength <= PART_BYTES, '파일 조각이 너무 커요.')
    await this.store.stagePart(hash, index, Buffer.from(raw).toString('base64'))
  }
  private async read(info: ObjectInfo) {
    const buffers = []
    for (let index = 0; index < info.parts; index += 4) {
      const batch = await Promise.all(Array.from({ length: Math.min(4, info.parts - index) }, (_, offset) =>
        this.store.objectPart(info.hash, index + offset)))
      for (const part of batch) {
        if (part === null) throw new SharedRequestError('파일 전송이 완료되지 않았어요.')
        buffers.push(Buffer.from(part, 'base64'))
      }
    }
    const buffer = Buffer.concat(buffers)
    assert(buffer.length === info.bytes && createHash('sha256').update(buffer).digest('hex') === info.hash,
      '파일 내용이 일치하지 않아요. 다시 시도해 주세요.')
    return buffer
  }
  async finish(info: ObjectInfo) {
    assert(validHash(info.hash) && Number.isInteger(info.bytes) && info.bytes > 0 && info.bytes <= MAX_OBJECT_BYTES,
      '파일 크기를 확인해 주세요.')
    assert(Number.isInteger(info.parts) && info.parts === Math.ceil(info.bytes / PART_BYTES), '파일 조각 수를 확인해 주세요.')
    assert(['application/json', 'image/jpeg', 'image/png', 'image/webp'].includes(info.type), '파일 형식을 확인해 주세요.')
    if (await this.store.objectInfo(info.hash)) return
    const buffer = await this.read(info)
    if (info.type === 'application/json') {
      try { validateTransport(JSON.parse(buffer.toString('utf8'))) }
      catch { throw new SharedRequestError('레시피 형식을 확인해 주세요.') }
    } else {
      assert(info.bytes <= 3_000_000, '사진 크기를 확인해 주세요.')
      const valid = info.type === 'image/jpeg' ? buffer[0] === 255 && buffer[1] === 216
        : info.type === 'image/png' ? buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
          : buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP'
      assert(valid, '사진 형식을 확인해 주세요.')
    }
    await this.store.finishObject(info)
  }
  async mutate(input: SharedMutation) {
    assert(typeof input.id === 'string' && input.id.length > 0 && input.id.length <= 100, '레시피 ID를 확인해 주세요.')
    assert(typeof input.operationId === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(input.operationId), '저장 요청을 확인해 주세요.')
    assert(Number.isInteger(input.expectedRevision) && input.expectedRevision >= 0, '저장 버전을 확인해 주세요.')
    if (input.hash !== null) {
      assert(validHash(input.hash), '레시피 파일을 확인해 주세요.')
      const meta = await this.store.objectInfo(input.hash)
      assert(meta && meta.type === 'application/json', '레시피 파일 전송이 완료되지 않았어요.')
      const recipe = validateTransport(JSON.parse((await this.read(meta)).toString('utf8')))
      assert(recipe.id === input.id, '레시피 ID가 일치하지 않아요.')
      for (const slot of photoSlots(recipe)) {
        const reference = slot.get()
        if (reference) {
          const image = await this.store.objectInfo(reference.slice(PHOTO_PREFIX.length))
          assert(image && image.type.startsWith('image/'), '사진 전송이 완료되지 않았어요.')
        }
      }
    }
    return this.store.mutate(input)
  }
}
