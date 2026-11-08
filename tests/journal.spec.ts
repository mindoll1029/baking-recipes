import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { exampleRecipe, makeBackup, newIngredient, newStep } from '../src/model'

async function openExample(page: Page) {
  await page.getByRole('button', { name: '레몬 파운드 케이크 열기', exact: true }).click()
  await expect(page.getByRole('heading', { name: '레몬 파운드 케이크', exact: true })).toBeVisible()
  await expect(page.locator('.app-shell')).toHaveAttribute('data-save-state', 'saved')
}
async function lastGridPage(page: Page) {
  await expect(page.locator('.step-grid')).toBeVisible()
  const next = page.getByRole('button', { name: '다음 단계 목록', exact: true })
  while ((await next.isVisible()) && (await next.isEnabled())) await next.click()
}
async function seedRecipes(page: Page, recipes: ReturnType<typeof exampleRecipe>[]) {
  await page.evaluate(async backup => new Promise<void>((resolve,reject) => {
    const request=indexedDB.open('oven-note',1)
    request.onerror=()=>reject(request.error)
    request.onsuccess=()=>{const db=request.result;const tx=db.transaction('journal','readwrite');tx.objectStore('journal').put(backup,'recipes');tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error)}
  }), makeBackup(recipes))
  await page.reload()
}
async function openImported(page: Page, recipe: ReturnType<typeof exampleRecipe>) {
  await seedRecipes(page,[recipe])
  await page.getByRole('button',{name:`${recipe.title} 열기`,exact:true}).click()
  await expect(page.locator('.app-shell')).toHaveAttribute('data-save-state','saved')
}
async function readJournal(page: Page) {
  await expect(page.locator('.app-shell')).toHaveAttribute('data-save-state','saved')
  return page.evaluate(async () => new Promise<{version:number;recipes:ReturnType<typeof exampleRecipe>[]}>((resolve,reject)=>{
    const request=indexedDB.open('oven-note',1)
    request.onsuccess=()=>{const db=request.result;const tx=db.transaction('journal','readonly');const value=tx.objectStore('journal').get('recipes');tx.oncomplete=()=>{db.close();resolve(value.result)};tx.onerror=()=>reject(tx.error)}
    request.onerror=()=>reject(request.error)
  }))
}
async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
}

const browserErrors = new WeakMap<Page, string[]>()
test.beforeEach(async ({ page }) => {
  await page.route('**/api/shared**', route => route.fulfill({ contentType: 'application/json',
    body: JSON.stringify({ shared: false, records: null }) }))
  const errors: string[] = []
  browserErrors.set(page, errors)
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.addInitScript(() => sessionStorage.setItem('oven-note:entrance-seen', '1'))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '나의 레시피 노트 1' })).toBeVisible()
})
test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page)).toEqual([])
})

test('shows recipe metadata in the collection and one preparation card with separate baking', async ({ page }) => {
  const tile = page.locator('.recipe-tile')
  await expect(tile).toContainText('완성 분량 8조각')
  await expect(tile).toContainText('전체 소요 시간 55분')
  await openExample(page)
  await expect(page.locator('.recipe-overview')).toHaveCount(0)
  await expect(page.locator('.step-card')).toHaveCount(1)
  await expect(page.getByText('단계 열기', { exact: true })).toHaveCount(0)
  await expect(page.getByText(/FINAL STEP/)).toHaveCount(0)
  await expect(page.getByRole('button', { name: '1단계 앞으로 이동' })).toHaveCount(0)
  await noHorizontalOverflow(page)
  await page.getByRole('button', { name: '다음 단계 목록', exact: true }).click()
  await expect(page.getByRole('article', { name: '2단계 카드', exact: true })).toBeVisible()
  await expect(page.locator('.step-card')).toHaveCount(1)
  await page.getByRole('button', { name: '이전 단계 목록', exact: true }).click()
  await page.getByRole('button', { name: '1단계 열기', exact: true }).click()
  const focus = page.getByRole('dialog', { name: '단계 전체 화면' })
  expect(await focus.boundingBox()).toMatchObject({ x: 0, y: 0, width: page.viewportSize()!.width, height: page.viewportSize()!.height })
  await expect(page.getByRole('button', { name: '이전 단계', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '다음 단계', exact: true }).click()
  await expect(page.getByLabel('2단계 제목', { exact: true })).toHaveValue('반죽 만들기')
  await page.getByRole('button', { name: '다음 단계', exact: true }).click()
  await page.getByRole('button', { name: '순서로 돌아가기' }).click()
  await expect(page.locator('.step-card')).toHaveCount(1)
  await expect(page.getByRole('button', { name: '3단계 열기', exact: true })).toBeFocused()
  await expect(page.getByRole('button', { name: '다음 단계 목록', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '굽기', exact: true }).click()
  await expect(page.getByLabel('1차 굽기 온도', { exact: true })).toHaveValue('170')
  await page.getByRole('button', { name: '완료하고 돌아가기' }).click()
  await expect(page.getByRole('button', { name: '굽기', exact: true })).toBeFocused()
  await expect(page.getByRole('article', { name: '마지막 굽기 카드' })).toHaveCount(0)
  await page.getByRole('button', { name: '레시피 정보 수정', exact: true }).click()
  await page.getByLabel('완성 분량', { exact: true }).fill('12개')
  await page.getByLabel('전체 소요 시간', { exact: true }).fill('75')
  await page.getByRole('button', { name: '레시피 정보 닫기' }).click()
  await page.getByRole('button', { name: '목록으로', exact: true }).click()
  await expect(tile).toContainText('완성 분량 12개')
  await expect(tile).toContainText('전체 소요 시간 75분')
  await page.reload()
  await expect(tile).toContainText('전체 소요 시간 75분')
})

test('sums every ingredient, scales quantities, and keeps the preparation checklist usable', async ({
  page,
}) => {
  const existing = exampleRecipe()
  existing.title = '기존 ml 재료 레시피'
  existing.baking.ingredients = [{ ...newIngredient(), name: '레몬즙', quantity: '5', unit: 'ml' }]
  await openImported(page, existing)
  await lastGridPage(page)
  await page.getByRole('button', { name: '굽기' }).click()
  await page.getByLabel('굽기 재료 1 이름', { exact: true }).fill('레몬즙')
  await page.getByLabel('굽기 재료 1 분량', { exact: true }).fill('5')
  await expect(page.getByLabel('굽기 재료 1 단위', { exact: true })).toHaveText('ml')
  await page.getByRole('button', { name: '완료하고 돌아가기' }).click()
  await page.getByRole('button', { name: '전체 재료', exact: true }).click()
  const summary = page.getByRole('complementary', { name: '전체 재료' })
  await expect(summary.getByRole('textbox')).toHaveCount(0)
  await expect(summary.getByRole('spinbutton')).toHaveCount(0)
  const lemon = summary.locator('.total-ingredient').filter({ hasText: '레몬즙' })
  await expect(lemon).toHaveCount(1)
  await expect(lemon).toContainText('35ml')
  await page.getByLabel('재료 배율', { exact: true }).selectOption('2')
  await expect(lemon).toContainText('70ml')
  await lemon.getByRole('checkbox').check()
  await expect(summary).toContainText('8가지 중 1가지 준비했어요')
  await summary.getByRole('button', { name: '초기화' }).click()
  await expect(lemon.getByRole('checkbox')).not.toBeChecked()
  await page.getByRole('button', { name: '전체 재료 닫기' }).click()
})

test('writes, reorders in the edit dialog, deletes, and restores steps', async ({
  page,
}) => {
  await page.getByRole('button', { name: '새 레시피 쓰기', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '레시피 정보', exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: '레시피 이름', exact: true }).fill('나의 초코 쿠키')
  await page.getByRole('button', { name: '레시피 정보 닫기' }).click()
  await page.getByRole('button', { name: '1단계 열기', exact: true }).click()
  await page.getByLabel('1단계 제목', { exact: true }).fill('초콜릿 녹이기')
  await page.getByLabel('1단계 만드는 방법', { exact: true }).fill('중탕으로 천천히 녹여요.')
  await page.getByRole('button', { name: '재료 추가', exact: true }).click()
  await page.getByLabel('1단계 재료 1 이름', { exact: true }).fill('초콜릿')
  await page.getByLabel('1단계 재료 1 분량', { exact: true }).fill('120')
  await page.getByRole('button', { name: '순서로 돌아가기' }).click()
  await page.getByRole('button', { name: '단계 추가', exact: true }).click()
  await page.getByLabel('2단계 제목', { exact: true }).fill('반죽 섞기')
  await page.getByRole('button', { name: '순서로 돌아가기' }).click()
  await page.getByRole('button', { name: '순서 변경', exact: true }).click()
  await page.getByRole('button', { name: '2단계 앞으로 이동' }).click()
  await page.getByRole('button', { name: '단계 순서 수정 닫기' }).click()
  await expect(page.getByRole('article', { name: '1단계 카드', exact: true })).toContainText(
    '반죽 섞기',
  )
  await page.getByRole('button', { name: '순서 변경', exact: true }).click()
  await page.getByRole('button', { name: '1단계 삭제', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '단계 삭제', exact: true }).click()
  await page.getByRole('button', { name: '단계 순서 수정 닫기' }).click()
  await expect(page.getByRole('article', { name: '1단계 카드', exact: true })).toContainText(
    '초콜릿 녹이기',
  )
  await expect(page.locator('.step-card')).toHaveCount(1)
  await expect(page.locator('.app-shell')).toHaveAttribute('data-save-state', 'saved')
  await page.reload()
  await expect(page.getByRole('heading', { name: '나의 초코 쿠키', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '순서 변경', exact: true }).click()
  await expect(page.getByRole('button', { name: '1단계 삭제', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '단계 순서 수정 닫기' }).click()
  await page.getByRole('button', { name: '1단계 열기', exact: true }).click()
  await expect(page.getByLabel('1단계 만드는 방법', { exact: true })).toHaveValue(
    '중탕으로 천천히 녹여요.',
  )
  await expect(page.getByLabel('1단계 재료 1 분량', { exact: true })).toHaveValue('120')
})

test('adds and deletes baking rounds, recalculates time, and saves independent copies', async ({
  page,
}) => {
  await openExample(page)
  await lastGridPage(page)
  await page.getByRole('button', { name: '굽기' }).click()
  await page.getByRole('button', { name: '굽기 칸 추가' }).click()
  await page.getByLabel('3차 굽기 온도', { exact: true }).fill('180')
  await page.getByLabel('3차 굽기 시간', { exact: true }).fill('5')
  await page.getByLabel('3차 굽기 메모', { exact: true }).fill('윗면을 노릇하게 마무리해요.')
  await expect(page.locator('.oven-total')).toContainText('45분')
  await page.getByRole('button', { name: '2차 굽기 삭제', exact: true }).click()
  await expect(page.locator('.oven-total')).toContainText('30분')
  await expect(page.getByLabel('2차 굽기 온도', { exact: true })).toHaveValue('180')
  await expect(page.getByText('자동 저장됨', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '완료하고 돌아가기' }).click()
  await page.reload()
  await lastGridPage(page)
  await page.getByRole('button', { name: '굽기', exact: true }).click()
  await expect(page.locator('.oven-total')).toContainText('30분')
  await page.getByRole('button', { name: '완료하고 돌아가기' }).click()
  await page.getByRole('button', { name: '레시피 복제' }).click()
  await lastGridPage(page)
  await page.getByRole('button', { name: '굽기' }).click()
  await expect(page.getByLabel('2차 굽기 메모', { exact: true })).toHaveValue(
    '윗면을 노릇하게 마무리해요.',
  )
  await page.getByRole('button', { name: '2차 굽기 삭제', exact: true }).click()
  await expect(page.getByRole('button', { name: '1차 굽기 삭제' })).toBeDisabled()
  await page.getByRole('button', { name: '완료하고 돌아가기' }).click()
  const backup = await readJournal(page)
  expect(backup.version).toBe(2)
  expect(backup.recipes).toHaveLength(2)
  expect(backup.recipes[0].baking.rounds).toHaveLength(1)
  expect(backup.recipes[1].baking.rounds).toHaveLength(2)
  expect(backup.recipes[0].baking.id).not.toBe(backup.recipes[1].baking.id)
  expect(backup.recipes[1].baking.rounds[1]).toMatchObject({
    temperature: '180',
    minutes: '5',
    note: '윗면을 노릇하게 마무리해요.',
  })
})

test('uploads and persists photos and duplicates a recipe without replacing its original', async ({
  page,
}) => {
  await openExample(page)
  await page.getByRole('button', { name: '레시피 정보 수정', exact: true }).click()
  const image = await page.locator('.details-cover .photo-picker').screenshot()
  await page
    .getByLabel('대표 사진', { exact: true })
    .setInputFiles({ name: 'cake.png', mimeType: 'image/png', buffer: image })
  await expect(page.locator('.details-cover img')).toHaveAttribute(
    'src',
    /^data:image\/jpeg;base64,/,
  )
  await page.getByRole('button', { name: '레시피 정보 닫기' }).click()
  await page.getByRole('button', { name: '1단계 열기', exact: true }).click()
  await page
    .getByLabel('1단계 사진', { exact: true })
    .setInputFiles({ name: 'mixing.png', mimeType: 'image/png', buffer: image })
  await expect(page.getByRole('img', { name: '단계 과정 사진' })).toHaveAttribute(
    'src',
    /^data:image\/jpeg;base64,/,
  )
  await expect(page.getByText('자동 저장됨', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '순서로 돌아가기' }).click()
  await page.reload()
  await page.getByRole('button', { name: '레시피 정보 수정', exact: true }).click()
  await expect(page.locator('.details-cover img')).toHaveAttribute(
    'src',
    /^data:image\/jpeg;base64,/,
  )
  await page.getByRole('button', { name: '레시피 정보 닫기' }).click()
  const backup = await readJournal(page)
  expect(backup.recipes[0].steps[0].photo).toMatch(/^data:image\/jpeg;base64,/)
  await page.getByRole('button', { name: '레시피 복제', exact: true }).click()
  await page.getByRole('button', { name: '1단계 열기', exact: true }).click()
  await expect(page.getByRole('img', { name: '단계 과정 사진' })).toHaveAttribute(
    'src',
    backup.recipes[0].steps[0].photo!,
  )
})

test('edits the cover directly from the collection and retains the original on file errors', async ({ page }) => {
  await expect(page.locator('.home-save [role="status"]')).toHaveAttribute('data-save-state', 'saved')
  const original = (await readJournal(page)).recipes[0]
  const image = await page.locator('.recipe-tile-cover').screenshot()
  const choose = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '레몬 파운드 케이크 이미지 수정', exact: true }).click()
  await (await choose).setFiles({ name: 'new-cover.png', mimeType: 'image/png', buffer: image })
  await expect(page.locator('.recipe-tile-cover img')).toHaveAttribute('src', /^data:image\/jpeg;base64,/)
  await expect(page.locator('.home-save [role="status"]')).toHaveAttribute('data-save-state', 'saved')
  await expect(page.getByRole('heading', { name: '나의 레시피 노트 1' })).toBeVisible()
  await expect(page.locator('button button')).toHaveCount(0)
  const edited = (await readJournal(page)).recipes[0]
  expect(edited.coverPreset).toBeNull()
  expect(edited.steps).toEqual(original.steps)
  expect(edited.baking).toEqual(original.baking)
  expect(edited.notes).toBe(original.notes)
  await page.reload()
  await expect(page.locator('.recipe-tile-cover img')).toHaveAttribute('src', edited.cover!)
  const badFile = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '레몬 파운드 케이크 이미지 수정', exact: true }).click()
  await (await badFile).setFiles({ name: 'wrong.gif', mimeType: 'image/gif', buffer: Buffer.from('not-an-image') })
  await expect(page.getByRole('alert')).toContainText('JPG')
  await expect(page.locator('.recipe-tile-cover img')).toHaveAttribute('src', edited.cover!)
})

test('saves separate baking guidance while preserving legacy notes through reload', async ({ page }) => {
  const existing = exampleRecipe()
  existing.title = '굽기 안내 레시피'
  existing.baking.tips = '이전에 기록한 굽기 팁'
  await openImported(page, existing)
  await page.getByRole('button', { name: '굽기', exact: true }).click()
  await page.locator('.legacy-baking-notes summary').click()
  await expect(page.getByLabel('굽기 만드는 방법', { exact: true })).toHaveValue(existing.baking.instructions)
  await expect(page.getByLabel('굽기 팁', { exact: true })).toHaveValue(existing.baking.tips)
  await page.locator('.legacy-baking-notes summary').click()
  const values = { preheating: '180도로 15분 예열해요.', panPosition: '아래에서 두 번째 칸', cooling: '틀에서 5분 식힌 뒤 식힘망에 올려요.' }
  for (const [label, value] of [['예열', values.preheating], ['틀 위치', values.panPosition], ['식히는 방법', values.cooling]]) {
    await page.getByLabel(`굽기 ${label}`, { exact: true }).fill(value)
  }
  await expect(page.getByRole('dialog').getByRole('status')).toHaveText('자동 저장됨')
  await page.getByRole('button', { name: '완료하고 돌아가기' }).click()
  await page.reload()
  const backup = await readJournal(page)
  expect(backup.recipes[0].baking).toMatchObject({ ...values, instructions: existing.baking.instructions, tips: existing.baking.tips })
  await page.getByRole('button', { name: '굽기', exact: true }).click()
  await expect(page.getByLabel('굽기 예열', { exact: true })).toHaveValue(values.preheating)
  await expect(page.getByLabel('굽기 틀 위치', { exact: true })).toHaveValue(values.panPosition)
  await expect(page.getByLabel('굽기 식히는 방법', { exact: true })).toHaveValue(values.cooling)
})

test('searches and favorites recipes and preserves an intentionally empty collection', async ({
  page,
}) => {
  await page.getByRole('button', { name: '레몬 파운드 케이크 즐겨찾기 추가', exact: true }).click()
  await page.getByRole('switch', { name: '즐겨찾기만 보기', exact: true }).click()
  await expect(page.locator('.recipe-tile')).toHaveCount(1)
  await page.getByRole('searchbox', { name: '레시피 검색' }).fill('초코')
  await expect(page.getByText('찾는 레시피가 없어요', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '전체 레시피 보기' }).click()
  await openExample(page)
  await page.getByRole('button', { name: '레시피 삭제', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '레시피 삭제', exact: true }).click()
  await expect(page.getByRole('heading', { name: '나의 레시피 노트 0' })).toBeVisible()
  await expect(page.getByRole('button', { name: '새 레시피 만들기', exact: true })).toBeVisible()
  await expect(page.locator('.home-save [role="status"]')).toHaveAttribute('data-save-state', 'saved')
  await page.reload()
  await expect(page.locator('.recipe-tile')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '나의 레시피 노트 0' })).toBeVisible()
})

test('toggles the whole filter and animates only locally clicked hearts with reduced-motion support', async ({ page }) => {
  const filter = page.getByRole('switch', { name: '즐겨찾기만 보기', exact: true })
  await filter.getByText('전체 레시피', { exact: true }).click()
  await expect(filter).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('.recipe-tile')).toHaveCount(0)
  await filter.getByText('즐겨찾기', { exact: true }).click()
  await expect(filter).toHaveAttribute('aria-checked', 'false')
  const heart = page.locator('.tile-favorite')
  await expect(heart).not.toHaveClass(/is-animating/)
  await heart.click()
  await expect(heart).toHaveAttribute('aria-pressed', 'true')
  expect(await heart.locator('svg').evaluate(el => el.getAnimations().some(animation =>
    Number(animation.effect?.getTiming().duration) >= 400))).toBe(true)
  await heart.click()
  await expect(heart).toHaveAttribute('aria-pressed', 'false')
  await expect(heart).toHaveClass(/is-animating/)
  await expect(heart).not.toHaveClass(/is-animating/)
  await filter.focus()
  await page.keyboard.press('Space')
  await expect(filter).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Space')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await heart.click()
  await expect(heart).toHaveAttribute('aria-pressed', 'true')
  await expect(heart).not.toHaveClass(/is-animating/)
  await expect(page.locator('.app-shell')).toHaveAttribute('data-save-state', 'saved')
  await page.reload()
  await expect(page.locator('.tile-favorite')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.tile-favorite')).not.toHaveClass(/is-animating/)
  await expect(page.locator('.shared-status-bar')).toHaveCount(0)
})

test('migrates existing browser data and preserves an original backup before saving the new format', async ({
  page,
}) => {
  await openExample(page)
  const existing = exampleRecipe()
  const oven = {
    ...newStep(),
    title: '노릇하게 굽기',
    instructions: '40분간 구워요. 기존 메모를 보존해 주세요.',
    photo:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
    ingredients: [{ ...newIngredient(), name: '덧바를 버터', quantity: '5', unit: 'g' }],
  }
  const legacy = {
    version: 1,
    exportedAt: new Date().toISOString(),
    recipes: [
      { ...existing, baking: undefined, steps: [existing.steps[0], oven, existing.steps[1]] },
    ],
  }
  await page.evaluate(async (data) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('oven-note', 1)
      request.onsuccess = () => {
        const database = request.result
        const transaction = database.transaction('journal', 'readwrite')
        transaction.objectStore('journal').put(data, 'recipes')
        transaction.oncomplete = () => {
          database.close()
          resolve()
        }
        transaction.onerror = () => reject(transaction.error)
      }
    })
  }, legacy)
  await page.goto('/#/')
  await page.reload()
  await openExample(page)
  await lastGridPage(page)
  await expect(page.getByRole('article', { name: '마지막 굽기 카드' })).toHaveCount(0)
  await page.getByRole('button', { name: '굽기' }).click()
  await expect(page.getByLabel('굽기 만드는 방법', { exact: true })).toHaveValue(oven.instructions)
  await expect(page.getByLabel('1차 굽기 온도', { exact: true })).toHaveValue('170')
  await expect(page.getByLabel('1차 굽기 시간', { exact: true })).toHaveValue('')
  await expect(page.getByRole('img', { name: '단계 과정 사진' })).toHaveAttribute('src', oven.photo)
  await expect(page.getByLabel('굽기 재료 1 이름', { exact: true })).toHaveValue('덧바를 버터')
  await expect(page.getByText('자동 저장됨', { exact: true })).toBeVisible()
  const stored = await page.evaluate(async () => {
    const request = indexedDB.open('oven-note', 1)
    return new Promise<{ current: { version: number }; original: unknown }>((resolve) => {
      request.onsuccess = () => {
        const database = request.result
        const transaction = database.transaction('journal', 'readonly')
        const current = transaction.objectStore('journal').get('recipes')
        const original = transaction.objectStore('journal').get('legacy-backup-v1')
        transaction.oncomplete = () => {
          database.close()
          resolve({ current: current.result, original: original.result })
        }
      }
    })
  })
  expect(stored.current.version).toBe(2)
  expect(stored.original).toEqual(JSON.parse(JSON.stringify(legacy)))
})

test('removes backup controls and shows photo errors inside the fullscreen editor', async ({
  page,
}) => {
  await expect(page.locator('.backup-menu')).toHaveCount(0)
  await expect(page.getByLabel('백업 파일',{exact:true})).toHaveCount(0)
  await openExample(page)
  await page.getByRole('button', { name: '1단계 열기', exact: true }).click()
  await page.getByLabel('1단계 사진', { exact: true }).setInputFiles({
    name: 'image.gif',
    mimeType: 'image/gif',
    buffer: Buffer.from('not-an-image'),
  })
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'JPG, PNG 또는 WebP 사진을 선택해 주세요.',
  )
})


test('saves separate preparation and baking tips across reload and local storage', async ({
  page,
}) => {
  await openExample(page)
  await page.getByRole('button', { name: '1단계 열기', exact: true }).click()
  const method = page.getByLabel('1단계 만드는 방법', { exact: true })
  const originalMethod = await method.inputValue()
  const tips = page.getByLabel('1단계 팁', { exact: true })
  await expect(tips).toHaveValue('')
  await tips.fill('버터는 실온에 두어요.\n달걀은 조금씩 넣어요.')
  await expect(method).toHaveValue(originalMethod)
  await expect(page.getByRole('dialog').getByRole('status')).toHaveText('자동 저장됨')
  await page.getByRole('button', { name: '순서로 돌아가기' }).click()
  await lastGridPage(page)
  await page.getByRole('button', { name: '굽기' }).click()
  await page.locator('.legacy-baking-notes summary').click()
  await page.getByLabel('굽기 팁', { exact: true }).fill('꼬치로 익은 상태를 확인해요.')
  await expect(page.getByRole('dialog').getByRole('status')).toHaveText('자동 저장됨')
  await page.reload()
  await expect(page.getByRole('heading', { name: '레몬 파운드 케이크', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '1단계 열기', exact: true }).click()
  await expect(tips).toHaveValue('버터는 실온에 두어요.\n달걀은 조금씩 넣어요.')
  await expect(method).toHaveValue(originalMethod)
  await noHorizontalOverflow(page)
  await page.getByRole('button', { name: '순서로 돌아가기' }).click()
  await lastGridPage(page)
  await page.getByRole('button', { name: '굽기' }).click()
  await expect(page.getByLabel('굽기 팁', { exact: true })).toHaveValue(
    '꼬치로 익은 상태를 확인해요.',
  )
  await page.getByRole('button', { name: '완료하고 돌아가기' }).click()
  const backup = await readJournal(page)
  expect(backup.recipes[0].steps[0].tips).toBe('버터는 실온에 두어요.\n달걀은 조금씩 넣어요.')
  expect(backup.recipes[0].baking.tips).toBe('꼬치로 익은 상태를 확인해요.')
})

test('opens tips from each step card and keeps tips with their step when reordered', async ({
  page,
}) => {
  await openExample(page)
  await page.getByRole('button', { name: '1단계 팁 편집', exact: true }).click()
  const first = page.getByLabel('1단계 팁', { exact: true })
  await expect(first).toBeFocused()
  await first.fill('첫 단계: 버터는 실온에 두어요.')
  await page.getByRole('button', { name: '다음 단계', exact: true }).click()
  const second = page.getByLabel('2단계 팁', { exact: true })
  await expect(second).toHaveValue('')
  await second.fill('두 번째 단계: 가루는 가볍게 섞어요.')
  await expect(page.getByRole('dialog').getByRole('status')).toHaveText('자동 저장됨')
  await page.getByRole('button', { name: '순서로 돌아가기' }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: '1단계 팁 편집', exact: true })).toContainText('첫 단계: 버터는 실온에 두어요.')
  await page.getByRole('button', { name: '다음 단계 목록', exact: true }).click()
  await page.getByRole('button', { name: '2단계 팁 편집', exact: true }).click()
  await expect(second).toBeFocused()
  await expect(second).toHaveValue('두 번째 단계: 가루는 가볍게 섞어요.')
  await page.getByRole('button', { name: '순서로 돌아가기' }).click()
  await page.getByRole('button', { name: '순서 변경', exact: true }).click()
  await page.getByRole('button', { name: '2단계 앞으로 이동', exact: true }).click()
  await page.getByRole('button', { name: '단계 순서 수정 닫기' }).click()
  await page.getByRole('button', { name: '1단계 팁 편집', exact: true }).click()
  await expect(first).toHaveValue('두 번째 단계: 가루는 가볍게 섞어요.')
  await page.getByRole('button', { name: '다음 단계', exact: true }).click()
  await expect(second).toHaveValue('첫 단계: 버터는 실온에 두어요.')
  await page.getByRole('button', { name: '순서로 돌아가기' }).click()
  const backup = await readJournal(page)
  expect(backup.recipes[0].steps[0].tips).toBe('두 번째 단계: 가루는 가볍게 섞어요.')
  expect(backup.recipes[0].steps[1].tips).toBe('첫 단계: 버터는 실온에 두어요.')
})

test('adds a preparation step from the last next button and preserves tips and recipe notes', async ({ page }) => {
  await openExample(page)
  await expect(page.getByRole('button', { name: '베이킹 메모', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '레시피 정보 수정', exact: true }).click()
  await page.getByLabel('베이킹 메모 내용', { exact: true }).fill('다음에는 작은 틀을 사용해요.')
  await page.getByRole('button', { name: '레시피 정보 닫기' }).click()
  await lastGridPage(page)
  await page.getByRole('button', { name: '3단계 열기', exact: true }).click()
  const original = await page.getByLabel('3단계 만드는 방법', { exact: true }).inputValue()
  await page.getByRole('button', { name: '다음 단계', exact: true }).click()
  await expect(page.getByLabel('4단계 제목', { exact: true })).toBeFocused()
  await expect(page.locator('.focus-position')).toContainText('04 / 04')
  await page.getByLabel('4단계 제목', { exact: true }).fill('새로 추가한 준비 단계')
  await page.getByLabel('4단계 팁', { exact: true }).fill('가루는 두 번 체 쳐요.\n재료를 천천히 섞어요.')
  await page.getByRole('button', { name: '이전 단계', exact: true }).click()
  await expect(page.getByLabel('3단계 만드는 방법', { exact: true })).toHaveValue(original)
  await page.getByRole('button', { name: '다음 단계', exact: true }).click()
  await expect(page.locator('.focus-position')).toContainText('04 / 04')
  await expect(page.getByLabel('4단계 제목', { exact: true })).toHaveValue('새로 추가한 준비 단계')
  await page.getByRole('button', { name: '다음 단계', exact: true }).click()
  await expect(page.getByLabel('5단계 제목', { exact: true })).toBeFocused()
  await expect(page.locator('.focus-position')).toContainText('05 / 05')
  await page.getByRole('button', { name: '이전 단계', exact: true }).click()
  await page.getByRole('button', { name: '순서로 돌아가기' }).click()
  await expect(page.locator('.card-tips-label')).toHaveText('팁')
  await expect(page.locator('.card-tips-text')).toHaveText('가루는 두 번 체 쳐요.\n재료를 천천히 섞어요.')
  await page.reload()
  await expect(page.locator('.steps-heading')).toContainText('5')
  const backup = await readJournal(page)
  expect(backup.recipes[0].steps).toHaveLength(5)
  expect(backup.recipes[0].steps[2].instructions).toBe(original)
  expect(backup.recipes[0].steps[3].tips).toBe('가루는 두 번 체 쳐요.\n재료를 천천히 섞어요.')
  expect(backup.recipes[0].notes).toBe('다음에는 작은 틀을 사용해요.')
  await page.getByRole('button', { name: '레시피 정보 수정', exact: true }).click()
  await expect(page.getByLabel('베이킹 메모 내용', { exact: true })).toHaveValue(backup.recipes[0].notes)
})

test('keeps automatic preparation additions within the 100-step limit', async ({ page }) => {
  test.setTimeout(90000)
  const existing = exampleRecipe()
  existing.title = '최대 단계 레시피'
  existing.steps = Array.from({ length: 100 }, (_, index) => ({ ...newStep(), title: `${index + 1}번째 준비` }))
  await openImported(page, existing)
  await expect(page.getByRole('button', { name: '단계 추가', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '1단계 열기', exact: true }).click()
  for (let index = 2; index <= 100; index++) {
    await page.locator('.step-dialog').dispatchEvent('keydown', { key: 'ArrowRight' })
    await expect(page.getByLabel(`${index}단계 제목`, { exact: true })).toHaveValue(`${index}번째 준비`)
  }
  await expect(page.getByRole('button', { name: '다음 단계', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '순서로 돌아가기' }).click()
  const backup = await readJournal(page)
  expect(backup.recipes[0].steps).toHaveLength(100)
})

test('automatically merges duplicate ingredients across cards and updates totals after edits', async ({ page }) => {
  const existing = exampleRecipe()
  existing.title = '기존 단위 레시피'
  existing.steps[0].ingredients[1].quantity = '0.1'
  existing.steps[0].ingredients[1].unit = 'kg'
  await openImported(page, existing)
  await page.reload()
  await page.getByRole('button', { name: '1단계 열기', exact: true }).click()
  const legacyUnit = page.getByLabel('1단계 재료 2 단위', { exact: true })
  await expect(legacyUnit).toHaveText('kg')
  await expect(page.locator('.ingredient-fields select')).toHaveCount(0)
  await expect(page.getByLabel('1단계 재료 2 분량', { exact: true })).toHaveValue('0.1')
  await page.getByRole('button', { name: '다음 단계', exact: true }).click()
  await page.getByRole('button', { name: '재료 추가', exact: true }).click()
  await page.getByLabel('2단계 재료 6 이름', { exact: true }).fill(' 설탕 ')
  await page.getByLabel('2단계 재료 6 분량', { exact: true }).fill('20')
  await expect(page.getByLabel('2단계 재료 6 분량', { exact: true })).toHaveAttribute('placeholder', 'g')
  await page.getByRole('button', { name: '순서로 돌아가기' }).click()
  await page.getByRole('button', { name: '전체 재료', exact: true }).click()
  const summary = page.getByRole('complementary', { name: '전체 재료' })
  const sugar = summary.locator('.total-ingredient').filter({ hasText: /^설탕/ })
  await expect(sugar).toHaveCount(1)
  await expect(sugar).toContainText('120g')
  await expect(summary.getByRole('textbox')).toHaveCount(0)
  await page.getByRole('button', { name: '전체 재료 닫기' }).click()
  await page.getByRole('button', { name: '2단계 열기', exact: true }).click()
  await page.getByLabel('2단계 재료 6 분량', { exact: true }).fill('40')
  await page.getByRole('button', { name: '순서로 돌아가기' }).click()
  await page.getByRole('button', { name: '전체 재료', exact: true }).click()
  await expect(sugar).toContainText('140g')
  await page.getByRole('button', { name: '전체 재료 닫기' }).click()
  const backup = await readJournal(page)
  const saved = backup.recipes.find((recipe: { title: string }) => recipe.title === existing.title)!
  expect(saved.steps[0].ingredients[1]).toMatchObject({ quantity: '0.1', unit: 'kg' })
  expect(saved.steps[1].ingredients[5]).toMatchObject({ quantity: '40', unit: 'g' })
})

async function storedStepTitles(page: Page) {
  return page.evaluate(async () => new Promise<string[]>((resolve, reject) => {
    const request = indexedDB.open('oven-note', 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const transaction = db.transaction('journal', 'readonly')
      const record = transaction.objectStore('journal').get('recipes')
      transaction.oncomplete = () => {
        db.close()
        resolve(record.result.recipes[0].steps.map((step: { title: string }) => step.title))
      }
      transaction.onerror = () => reject(transaction.error)
    }
  }))
}

test('previews drag insertion between rows, cancels with Escape, and saves only on drop', async ({ page }) => {
  await openExample(page)
  await page.getByRole('button', { name: '순서 변경', exact: true }).click()
  const original = await storedStepTitles(page)
  const titles = page.locator('.order-title')
  const handle = page.getByRole('button', { name: '1단계 순서 이동 손잡이', exact: true })
  const box = (await handle.boundingBox())!
  const third = (await page.locator('.order-list > li').nth(2).boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, third.y - 2, { steps: 10 })
  await expect(titles.nth(0)).toContainText(original[1])
  await expect(titles.nth(1)).toContainText(original[0])
  expect(await storedStepTitles(page)).toEqual(original)
  await expect(page.locator('.order-drag-ghost')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(titles.nth(0)).toContainText(original[0])
  await expect(page.getByRole('dialog', { name: '단계 순서 수정', exact: true })).toBeVisible()
  await expect(page.locator('.order-drag-ghost')).toHaveCount(0)
  expect(await storedStepTitles(page)).toEqual(original)
  await expect(handle).toBeFocused()
  // Wait for the canceled row to finish returning before grabbing again.
  await expect.poll(() => page.locator('.order-list').evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0)
  const start = (await handle.boundingBox())!
  const last = (await page.locator('.order-list > li').last().boundingBox())!
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await page.mouse.move(start.x + start.width / 2, last.y + last.height - 4, { steps: 10 })
  await page.mouse.up()
  await expect(titles.last()).toContainText(original[0])
  await expect.poll(() => storedStepTitles(page)).toEqual([original[1], original[2], original[0]])
  await page.getByRole('button', { name: '단계 순서 수정 닫기' }).click()
  await page.reload()
  await page.getByRole('button', { name: '순서 변경', exact: true }).click()
  await expect(titles.last()).toContainText(original[0])
})

test('animates arrow-button reordering and card paging, supports keyboard and reduced motion', async ({ page }) => {
  await openExample(page)
  await page.getByRole('button', { name: '순서 변경', exact: true }).click()
  await page.getByRole('button', { name: '2단계 앞으로 이동', exact: true }).click()
  await expect(page.locator('.order-title').first()).toContainText('반죽 만들기')
  expect(await page.locator('.order-list > li').evaluateAll(rows => rows.some(row => row.getAnimations().some(a =>
    Number(a.effect?.getTiming().duration) > 100)))).toBe(true)
  const first = page.getByRole('button', { name: '1단계 순서 이동 손잡이', exact: true })
  await first.focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('.order-title').first()).toContainText('버터와 설탕 섞기')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: '2단계 앞으로 이동', exact: true }).click()
  await expect.poll(() => page.locator('.order-list > li').evaluateAll(rows => rows.flatMap(row => row.getAnimations()).filter(a =>
    Number(a.effect?.getTiming().duration) > 100).length)).toBe(0)
  await page.getByRole('button', { name: '단계 순서 수정 닫기' }).click()
  await page.getByRole('button', { name: '다음 단계 목록', exact: true }).click()
  expect(await page.locator('.step-card').evaluate(el => getComputedStyle(el).animationName)).toBe('none')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.getByRole('button', { name: '다음 단계 목록', exact: true }).click()
  expect(await page.locator('.step-card').evaluate(el => getComputedStyle(el).animationName)).toBe('card-from-right')
  await page.getByRole('button', { name: '이전 단계 목록', exact: true }).click()
  expect(await page.locator('.step-card').evaluate(el => getComputedStyle(el).animationName)).toBe('card-from-left')
  await page.getByRole('button', { name: '2단계 열기', exact: true }).click()
  await page.getByRole('button', { name: '다음 단계', exact: true }).click()
  expect(await page.locator('.focus-body').evaluate(el => getComputedStyle(el).animationName)).toBe('card-from-right')
})

test('reorders through a real touch gesture on the left handle', async ({ page }) => {
  await openExample(page)
  await page.getByRole('button', { name: '순서 변경', exact: true }).click()
  const original = await storedStepTitles(page)
  const handle = (await page.getByRole('button', { name: '1단계 순서 이동 손잡이', exact: true }).boundingBox())!
  const last = (await page.locator('.order-list > li').last().boundingBox())!
  const session = await page.context().newCDPSession(page)
  const x = handle.x + handle.width / 2
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: handle.y + handle.height / 2 }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: last.y + last.height - 4 }] })
  await expect(page.locator('.order-title').last()).toContainText(original[0])
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect.poll(() => storedStepTitles(page)).toEqual([original[1], original[2], original[0]])
  await expect(page.locator('.order-drag-ghost')).toHaveCount(0)
  await session.detach()
})

test('scrolls a long order list while holding a dragged step near its edge', async ({ page }) => {
  const recipe = exampleRecipe()
  recipe.title = '드래그 긴 목록 테스트'
  recipe.steps = Array.from({ length: 18 }, (_, i) => ({ ...newStep(), title: `준비 항목 ${i + 1}` }))
  await openImported(page,recipe)
  await page.getByRole('button', { name: '순서 변경', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '단계 순서 수정', exact: true })
  const handle = (await page.getByRole('button', { name: '1단계 순서 이동 손잡이', exact: true }).boundingBox())!
  const bounds = (await dialog.boundingBox())!
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(handle.x + handle.width / 2, bounds.y + bounds.height - 8, { steps: 8 })
  await expect.poll(() => dialog.evaluate(el => el.scrollTop), { timeout: 10000 }).toBeGreaterThan(200)
  await expect(page.locator('.order-title').last()).toHaveText('18. 준비 항목 1', { timeout: 15000 })
  await page.mouse.up()
  await expect.poll(() => storedStepTitles(page)).toEqual([
    ...Array.from({ length: 17 }, (_, i) => `준비 항목 ${i + 2}`), '준비 항목 1',
  ])
})
