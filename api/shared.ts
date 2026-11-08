import type { IncomingMessage, ServerResponse } from 'node:http'
import { RedisSharedStore } from '../server/shared-store.js'
import { SharedRequestError, SharedService } from '../server/shared-service.js'
import { PART_BYTES } from '../src/shared-protocol.js'
import type { ObjectInfo, SharedMutation } from '../src/shared-protocol.js'

type Request = IncomingMessage & { body?: unknown }
async function body(request: Request): Promise<Buffer> {
  if (Buffer.isBuffer(request.body)) return request.body
  if (typeof request.body === 'string') return Buffer.from(request.body)
  if (request.body !== undefined) return Buffer.from(JSON.stringify(request.body))
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of request) {
    const raw = Buffer.from(chunk)
    bytes += raw.length
    if (bytes > PART_BYTES + 4096) throw new SharedRequestError('요청이 너무 커요.', 413)
    chunks.push(raw)
  }
  return Buffer.concat(chunks)
}
export default async function handler(request: Request, response: ServerResponse) {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  const json = (status: number, value: unknown) => {
    response.statusCode = status
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.end(JSON.stringify(value))
  }
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    if (request.method === 'GET' && !(request.url || '').includes('action=object'))
      return json(200, { shared: false, records: null, code: 'not_configured' })
    return json(503, { error: '서버 저장소 연결을 준비 중이에요.', code: 'not_configured' })
  }
  try {
    if (request.method !== 'GET') {
      const origin = request.headers.origin
      const host = request.headers.host
      if (origin && new URL(origin).host !== host) return json(403, { error: '이 사이트에서 요청해 주세요.' })
    }
    const service = new SharedService(new RedisSharedStore(url, token))
    const query = new URL(request.url || '/', 'https://local.invalid').searchParams
    const action = query.get('action') || 'manifest'
    const hash = query.get('hash') || ''
    const part = Number(query.get('part'))
    if (request.method === 'GET' && action === 'manifest') return json(200, { records: await service.list(), shared: true })
    if (request.method === 'GET' && action === 'object-info') return json(200, { object: await service.info(hash) })
    if (request.method === 'GET' && action === 'object-part') {
      const raw = await service.part(hash, part)
      response.setHeader('Content-Type', 'application/octet-stream')
      response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      response.end(raw)
      return
    }
    if (request.method === 'PUT' && action === 'object-part') {
      await service.stage(hash, part, await body(request))
      return json(200, { ok: true })
    }
    if (request.method === 'POST' && action === 'object-commit') {
      await service.finish(JSON.parse((await body(request)).toString('utf8')) as ObjectInfo)
      return json(200, { ok: true })
    }
    if (request.method === 'POST' && action === 'mutate') {
      const result = await service.mutate(JSON.parse((await body(request)).toString('utf8')) as SharedMutation)
      return json(result.ok ? 200 : 409, result)
    }
    return json(405, { error: '지원하지 않는 요청이에요.' })
  } catch (error) {
    return json(error instanceof SharedRequestError ? error.status : 503, {
      error: error instanceof SharedRequestError ? error.message : '서버 저장을 완료하지 못했어요. 기기 기록은 보관됩니다.',
    })
  }
}
