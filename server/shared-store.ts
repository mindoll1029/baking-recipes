import type { MutationResult, ObjectInfo, SharedMutation, SharedRecord } from '../src/shared-protocol.js'

export interface SharedStore {
  list(): Promise<SharedRecord[]>
  objectInfo(hash: string): Promise<ObjectInfo | null>
  objectPart(hash: string, part: number): Promise<string | null>
  stagePart(hash: string, part: number, base64: string): Promise<void>
  finishObject(info: ObjectInfo): Promise<void>
  mutate(input: SharedMutation): Promise<MutationResult>
}

const PREFIX = 'oven-note:shared:v1:'
const MUTATE = `
local replay = redis.call('GET', KEYS[5])
if replay then return replay end
local raw = redis.call('GET', KEYS[3])
local current = {id=ARGV[3], revision=0, hash=cjson.null, deleted=true}
if raw then current = cjson.decode(raw) end
local removing = ARGV[2] == ''
if removing and current.deleted then
  local result = cjson.encode({ok=true,record=current})
  redis.call('SET',KEYS[5],result,'EX',604800)
  return result
end
if current.revision ~= tonumber(ARGV[1]) then
  return cjson.encode({ok=false,record=current})
end
if not removing and current.deleted and redis.call('SCARD',KEYS[4]) >= 500 then
  return redis.error_reply('RECIPE_LIMIT')
end
local revision = redis.call('INCR',KEYS[1])
local record = {id=ARGV[3],revision=revision,hash=cjson.null,deleted=removing}
if not removing then record.hash=ARGV[2] end
local encoded = cjson.encode(record)
if removing then
  redis.call('SET',KEYS[3],encoded,'EX',7776000)
  redis.call('SREM',KEYS[4],ARGV[3])
else
  redis.call('SET',KEYS[3],encoded)
  redis.call('SADD',KEYS[4],ARGV[3])
end
redis.call('ZADD',KEYS[2],revision,ARGV[3])
local result = cjson.encode({ok=true,record=record})
redis.call('SET',KEYS[5],result,'EX',604800)
return result`

const FINISH = `
if redis.call('EXISTS',KEYS[1]) == 1 then return 1 end
local used = tonumber(redis.call('GET',KEYS[2]) or '0')
if used + tonumber(ARGV[2]) > 157286400 then return redis.error_reply('STORAGE_LIMIT') end
for i=3,#KEYS do
  if redis.call('EXISTS',KEYS[i]) == 0 then return redis.error_reply('MISSING_PART') end
end
for i=3,#KEYS do redis.call('PERSIST',KEYS[i]) end
redis.call('SET',KEYS[1],ARGV[1])
redis.call('INCRBY',KEYS[2],ARGV[2])
return 1`

export class RedisSharedStore implements SharedStore {
  constructor(private url: string, private token: string) {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') throw new Error('Invalid storage endpoint')
  }
  private async command<T>(...command: (string | number)[]): Promise<T> {
    const response = await fetch(this.url, {
      method: 'POST', headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command), signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) throw new Error('서버 저장소에 연결하지 못했어요.')
    const data = await response.json() as { result: T; error?: string }
    if (data.error) {
      if (data.error.includes('RECIPE_LIMIT')) throw new Error('공유 레시피는 최대 500개까지 보관할 수 있어요.')
      if (data.error.includes('STORAGE_LIMIT')) throw new Error('서버 저장 공간이 가득 찼어요. 기기 기록은 그대로 보관됩니다.')
      throw new Error('서버 저장을 완료하지 못했어요.')
    }
    return data.result
  }
  async list(): Promise<SharedRecord[]> {
    const values = await this.command<string[]>('EVAL', `
local ids=redis.call('ZRANGE',KEYS[1],0,-1)
local result={}
for _,id in ipairs(ids) do
  local value=redis.call('GET',ARGV[1]..id)
  if value then table.insert(result,value) else redis.call('ZREM',KEYS[1],id) end
end
return result`, 1, PREFIX + 'index', PREFIX + 'record:')
    return values.map(value => JSON.parse(value) as SharedRecord)
  }
  async objectInfo(hash: string): Promise<ObjectInfo | null> {
    const value = await this.command<string | null>('GET', PREFIX + 'object:' + hash)
    return value === null ? null : JSON.parse(value) as ObjectInfo
  }
  objectPart(hash: string, part: number) {
    return this.command<string | null>('GET', `${PREFIX}part:${hash}:${part}`)
  }
  async stagePart(hash: string, part: number, base64: string) {
    await this.command('EVAL', `
if redis.call('EXISTS',KEYS[1]) == 1 then return 1 end
local prior=redis.call('GET',KEYS[2])
if prior and prior ~= ARGV[1] then return redis.error_reply('PART_CONFLICT') end
if not prior then redis.call('SET',KEYS[2],ARGV[1],'EX',86400) end
return 1`, 2, PREFIX + 'object:' + hash, `${PREFIX}part:${hash}:${part}`, base64)
  }
  async finishObject(info: ObjectInfo) {
    const keys = [PREFIX + 'object:' + info.hash, PREFIX + 'bytes',
      ...Array.from({ length: info.parts }, (_, index) => `${PREFIX}part:${info.hash}:${index}`)]
    await this.command('EVAL', FINISH, keys.length, ...keys, JSON.stringify(info), info.bytes)
  }
  async mutate(input: SharedMutation): Promise<MutationResult> {
    const result = await this.command<string>('EVAL', MUTATE, 5,
      PREFIX + 'revision', PREFIX + 'index', PREFIX + 'record:' + input.id,
      PREFIX + 'live', PREFIX + 'operation:' + input.operationId,
      input.expectedRevision, input.hash ?? '', input.id)
    return JSON.parse(result) as MutationResult
  }
}
