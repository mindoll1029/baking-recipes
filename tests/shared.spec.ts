import { test, expect } from '@playwright/test'
import type { Browser, BrowserContext, BrowserContextOptions, Page } from '@playwright/test'
import { MemorySharedStore, memoryFetch } from './support/shared-memory'
import { exampleRecipe, makeBackup } from '../src/model'

async function sharedContext(browser: Browser, store: MemorySharedStore, options: BrowserContextOptions) {
  const context = await browser.newContext({ ...options, baseURL: 'https://baking-recipes-two.vercel.app' })
  await context.route('https://baking-recipes-two.vercel.app/**', async route => {
    try { await route.fulfill({ response: await route.fetch() }) }
    catch (error) {
      // Reloading intentionally cancels decorative images still being fetched.
      if (!/Route is already handled|Request context disposed|Target page, context or browser has been closed/.test(String(error))) throw error
    }
  })
  const request = memoryFetch(store)
  await context.route('**/api/shared**', async route => {
    const req = route.request()
    const response = await request(req.url(), { method: req.method(), headers: req.headers(),
      body: req.method() === 'GET' ? undefined : Uint8Array.from(req.postDataBuffer() ?? []).buffer })
    await route.fulfill({ status: response.status, contentType: response.headers.get('content-type') || 'application/octet-stream',
      body: Buffer.from(await response.arrayBuffer()) })
  })
  await context.addInitScript(() => sessionStorage.setItem('oven-note:entrance-seen', '1'))
  return context
}
async function close(context: BrowserContext) {
  await context.unrouteAll({ behavior: 'ignoreErrors' })
  await context.close()
}
async function open(context: BrowserContext) {
  const page = await context.newPage()
  await page.goto('/')
  await expect(page.locator('.app-shell')).toHaveAttribute('data-sync-state','shared',{timeout:15000})
  return page
}
async function synchronize(page: Page) {
  await expect(page.locator('.app-shell')).toHaveAttribute('data-sync-state','shared',{timeout:15000})
}

test('automatically shares recipes, cover photos, edits and deletion between independent devices without login', async ({ browser, page: devicePage }, testInfo) => {
  const options = { viewport: devicePage.viewportSize()!, isMobile: testInfo.project.name === 'mobile', hasTouch: testInfo.project.name === 'mobile' }
  const store = new MemorySharedStore()
  const a = await sharedContext(browser, store, options), b = await sharedContext(browser, store, options)
  try {
    const first = await open(a), second = await open(b)
    await expect(first.getByRole('heading', { name: '나의 레시피 노트 0' })).toBeVisible({timeout:15000})
    await first.getByRole('button', { name: '새 레시피 쓰기', exact: true }).click()
    await first.getByLabel('레시피 이름', { exact: true }).fill('함께 만드는 쿠키')
    const picture = await first.locator('.details-cover .photo-picker').screenshot()
    await first.getByLabel('대표 사진', { exact: true }).setInputFiles({ name: 'shared.png', mimeType: 'image/png', buffer: picture })
    await expect(first.locator('.details-cover img')).toHaveAttribute('src', /^data:image\/jpeg;base64,/)
    await first.getByRole('button', { name: '레시피 정보 닫기' }).click()
    await synchronize(first); await synchronize(second)
    await second.getByRole('button', { name: '함께 만드는 쿠키 열기', exact: true }).click()
    await second.getByRole('button', { name: '레시피 정보 수정', exact: true }).click()
    await expect(second.locator('.details-cover img')).toHaveAttribute('src', /^data:image\/jpeg;base64,/)
    await second.getByLabel('레시피 이름', { exact: true }).fill('다른 기기에서 바꾼 쿠키')
    await second.getByRole('button', { name: '레시피 정보 닫기' }).click()
    await synchronize(second); await synchronize(first)
    await expect(first.getByRole('heading', { name: '다른 기기에서 바꾼 쿠키', exact: true })).toBeVisible({timeout:15000})
    await second.getByRole('button', { name: '레시피 삭제', exact: true }).click()
    await second.getByRole('dialog').getByRole('button', { name: '레시피 삭제', exact: true }).click()
    await synchronize(second); await synchronize(first)
    await expect(first.getByText('이 레시피를 찾을 수 없어요', { exact: true })).toBeVisible({timeout:15000})
  } finally { await close(a); await close(b) }
})

test('preserves existing private recipes and publishes them only after the share action', async ({ browser, page: devicePage }, testInfo) => {
  const options = { viewport: devicePage.viewportSize()!, isMobile: testInfo.project.name === 'mobile', hasTouch: testInfo.project.name === 'mobile' }
  const store = new MemorySharedStore(), context = await sharedContext(browser, store, options)
  try {
    const recipe = exampleRecipe(); recipe.title = '이 기기의 이전 기록'
    await context.addInitScript(backup => {
      const request = indexedDB.open('oven-note', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('journal')
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction('journal', 'readwrite')
        tx.objectStore('journal').put(backup, 'recipes')
        tx.oncomplete = () => db.close()
      }
    }, makeBackup([recipe]))
    const page = await open(context)
    await expect(page.getByRole('button', { name: '기기 기록 1개 공유에 추가', exact: true })).toBeVisible({timeout:15000})
    expect([...store.records.values()].filter(record => !record.deleted)).toHaveLength(0)
    await expect(page.getByRole('button',{name:'기기 기록 백업',exact:true})).toHaveCount(0)
    await page.getByRole('button', { name: '기기 기록 1개 공유에 추가', exact: true }).click()
    await synchronize(page)
    expect([...store.records.values()].filter(record => !record.deleted)).toHaveLength(1)
  } finally { await close(context) }
})

test('retains offline edits in IndexedDB through reload and shares them after reconnecting', async ({ browser, page: devicePage }, testInfo) => {
  const options = { viewport: devicePage.viewportSize()!, isMobile: testInfo.project.name === 'mobile', hasTouch: testInfo.project.name === 'mobile' }
  const store = new MemorySharedStore(), context = await sharedContext(browser, store, options)
  let online = true
  await context.route('**/api/shared**', route => online ? route.fallback() : route.abort('internetdisconnected'))
  try {
    const page = await open(context)
    await page.getByRole('button', { name: '새 레시피 쓰기', exact: true }).click()
    await page.getByLabel('레시피 이름', { exact: true }).fill('연결 전의 기록')
    await page.getByRole('button', { name: '레시피 정보 닫기' }).click()
    await synchronize(page)
    online = false
    await page.getByRole('button', { name: '레시피 정보 수정', exact: true }).click()
    await page.getByLabel('레시피 이름', { exact: true }).fill('오프라인에서도 보관한 기록')
    await page.getByRole('button', { name: '레시피 정보 닫기' }).click()
    await expect(page.locator('.app-shell')).toHaveAttribute('data-save-state','saved')
      await expect(page.locator('.app-shell')).toHaveAttribute('data-sync-state','offline',{timeout:15000})
    await page.reload()
    await expect(page.getByRole('heading', { name: '오프라인에서도 보관한 기록', exact: true })).toBeVisible({timeout:15000})
    online = true
    await synchronize(page)
    const other = await sharedContext(browser, store, options)
    try {
      const second = await open(other)
      await expect(second.getByRole('button', { name: '오프라인에서도 보관한 기록 열기', exact: true })).toBeVisible({timeout:15000})
      expect([...store.records.values()].filter(record => !record.deleted)).toHaveLength(1)
    } finally { await close(other) }
  } finally { await close(context) }
})
