import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { exampleRecipe, makeBackup } from '../src/model'

const scene = (page: Page) => page.getByRole('dialog', { name: '오븐 노트 시작 화면' })

test.beforeEach(async ({ page }) => {
  await page.route('**/api/shared**', route => route.fulfill({ contentType: 'application/json',
    body: JSON.stringify({ shared: false, records: null }) }))
})

async function sceneTime(page: Page, time: number) {
  await page.evaluate(time => {
    document.querySelector('.oven-entrance')!.getAnimations({ subtree: true }).forEach(animation => {
      animation.pause()
      animation.currentTime = time
    })
  }, time)
}

async function motionState(page: Page) {
  return page.evaluate(() => {
    const body = document.querySelector<SVGGElement>('.piggy-body')!
    const hand = document.querySelector<SVGGElement>('.piggy-hand')!
    const transform = new DOMMatrix(getComputedStyle(body).transform)
    const project = (x: number, y: number) => {
      const point = new DOMPoint(x, y).matrixTransform(body.getScreenCTM()!)
      return { x: point.x, y: point.y }
    }
    const palm = new DOMPoint(0, 935).matrixTransform(hand.getScreenCTM()!)
    const edge = document.querySelector('.piggy-opening')!.getBoundingClientRect().left
    return {
      angle: Math.atan2(transform.b, transform.a) * 180 / Math.PI,
      scaleX: Math.hypot(transform.a, transform.b), scaleY: Math.hypot(transform.c, transform.d),
      faceLeft: project(190, 550), faceRight: project(925, 550),
      pivot: project(740, 1310), footInner: project(585, 1240), footOuter: project(766, 1240),
      hand: { x: palm.x, y: palm.y, opacity: getComputedStyle(hand).opacity },
      bodyOpacity: getComputedStyle(body).opacity, edge,
    }
  })
}

test('holds the wall and leans around a fixed foot pivot with only a sliver of the foot showing', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.clock.install()
  await page.goto('/')
  await expect(scene(page)).toHaveAttribute('data-ready', 'true')
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000))
  await expect(scene(page)).toBeFocused()
  await expect(page.locator('.recipe-app')).toHaveAttribute('inert', '')
  await expect(scene(page)).toHaveAttribute('aria-describedby', 'entrance-description')
  const images = await page.evaluate(async () => {
    const urls = [...new Set([...document.querySelectorAll('.piggy-scene image, .piggy-scene img')]
      .map(el => (el.getAttribute('href') || el.getAttribute('src'))!))]
    return Promise.all(urls.map(async name => {
      const image = new Image()
      image.src = name
      await image.decode()
      let sha256: string | null = null
      if (name.includes('piggy-body') || name.includes('piggy-hands')) {
        const response = await fetch(name)
        if (!response.ok) throw new Error(`Artwork request failed: ${name}`)
        const hash = await crypto.subtle.digest('SHA-256', await response.arrayBuffer())
        sha256 = [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('')
      }
      return { name, width: image.naturalWidth, height: image.naturalHeight, sha256 }
    }))
  })
  expect(images).toHaveLength(4)
  expect(images.every(image => image.width > 500 && image.height > 500)).toBe(true)
  // Verify the files referenced by the rendered SVG against the actual ZIP
  // entries, rather than loading a separate list of supposedly correct images.
  expect(images.find(image => image.name.includes('piggy-body'))).toMatchObject({
    width: 1122, height: 1402, sha256: 'f02d07d7f352e6f1d2cbd8d3eefcb2e10e8f37657ca111ddc87543cf2d29dd12',
  })
  expect(images.find(image => image.name.includes('piggy-hands'))).toMatchObject({
    width: 1536, height: 1024, sha256: '454629f4a7ff0c930b049fb83cf63bee11cd3aef70836a52c6c44388b9e0c76b',
  })
  await sceneTime(page, 0)
  const hidden = await motionState(page)
  expect(hidden.faceRight.x).toBeLessThan(hidden.edge)
  await sceneTime(page, 900)
  const grip = await motionState(page)
  expect(grip.faceRight.x).toBeLessThan(grip.edge)
  expect(grip.hand.opacity).toBe('1')
  await sceneTime(page, 1750)
  const peek = await motionState(page)
  expect(peek.faceRight.x).toBeGreaterThan(peek.edge)
  expect(peek.angle).toBeGreaterThan(5)
  await sceneTime(page, 3800)
  const leaning = await motionState(page)
  expect(leaning.angle).toBeGreaterThan(peek.angle + 2)
  const visibleFace = (leaning.faceRight.x - leaning.edge) / (leaning.faceRight.x - leaning.faceLeft.x)
  expect(visibleFace).toBeGreaterThan(.4)
  expect(visibleFace).toBeLessThan(.65)
  const visibleFoot = (leaning.footOuter.x - leaning.edge) / (leaning.footOuter.x - leaning.footInner.x)
  expect(visibleFoot).toBeGreaterThan(.02)
  expect(visibleFoot).toBeLessThan(.25)
  // The foot pivot remains planted throughout the arc, including the hidden
  // pose. Translation of the whole body would move this point and fail.
  for (const time of [0, 600, 900, 1200, 1750, 2200, 3000, 3800, 4200]) {
    await sceneTime(page, time)
    const state = await motionState(page)
    expect(Math.abs(state.pivot.x - hidden.pivot.x)).toBeLessThan(.05)
    expect(Math.abs(state.pivot.y - hidden.pivot.y)).toBeLessThan(.05)
    if (time >= 1200) {
      expect(Math.abs(state.hand.x - grip.hand.x)).toBeLessThan(1)
      expect(Math.abs(state.hand.y - grip.hand.y)).toBeLessThan(1)
      expect(Math.abs(state.hand.x - state.edge)).toBeLessThan(1)
      expect(state.hand.opacity).toBe('1')
    }
    expect(state.bodyOpacity).toBe('1')
    expect(state.scaleX).toBeCloseTo(1, 4)
    expect(state.scaleY).toBeCloseTo(1, 4)
    expect(state.faceLeft.x).toBeLessThan(state.edge)
  }
  await sceneTime(page, 4500)
  expect(Number(await scene(page).evaluate(el => getComputedStyle(el).opacity))).toBeLessThan(1)
  await page.evaluate(() => document.querySelector('.oven-entrance')!.getAnimations().forEach(animation => animation.finish()))
  await expect(scene(page)).toHaveCount(0)
  await expect(page.locator('#main-content')).toBeFocused()
  await expect(page.getByRole('heading', { name: '나의 레시피 노트 1' })).toBeVisible()
  await expect(page.locator('.recipe-app')).not.toHaveAttribute('inert')
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
  expect(errors).toEqual([])
})

test('traps Tab, restores focus and explicitly replays an already-seen opening', async ({ page }) => {
  await page.goto('/')
  await expect(scene(page)).toBeFocused()
  const skip = page.getByRole('button', { name: '바로 들어가기' })
  await page.keyboard.press('Shift+Tab')
  await expect(skip).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(skip).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(skip).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(scene(page)).toHaveCount(0)
  await expect(page.locator('#main-content')).toBeFocused()
  expect(await page.evaluate(() => sessionStorage.getItem('oven-note:entrance-seen'))).toBe('1')
  await page.reload()
  await expect(scene(page)).toHaveCount(0)
  await page.goto('/?intro=1&keep=example')
  await expect(scene(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(scene(page)).toHaveCount(0)
  await expect(page.locator('#main-content')).toBeFocused()
  expect(new URL(page.url()).searchParams.has('intro')).toBe(false)
  expect(new URL(page.url()).searchParams.get('keep')).toBe('example')
  await page.reload()
  await expect(scene(page)).toHaveCount(0)
  await page.getByRole('button', { name: '레몬 파운드 케이크 열기', exact: true }).click()
  await expect(page.getByRole('heading', { name: '레몬 파운드 케이크', exact: true })).toBeVisible()
})

test('respects reduced motion on entry and while the animation is running', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?intro=1')
  await expect(page.getByRole('heading', { name: '나의 레시피 노트 1' })).toBeVisible()
  await expect(scene(page)).toHaveCount(0)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.reload()
  await expect(scene(page)).toBeVisible()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(scene(page)).toHaveCount(0)
  await expect(page.locator('.recipe-app')).not.toHaveAttribute('inert')
})

test('finishes automatically even when session storage is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'sessionStorage', { get() { throw new DOMException('Blocked', 'SecurityError') } })
  })
  await page.goto('/')
  await expect(scene(page)).toHaveAttribute('data-ready', 'true')
  await expect(scene(page)).toHaveCount(0, { timeout: 7000 })
  await expect(page.getByRole('heading', { name: '나의 레시피 노트 1' })).toBeVisible()
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
})

test('a failed image request immediately releases the recipe page', async ({ page }) => {
  await page.route('**/piggy-body*.png', route => route.abort())
  await page.goto('/')
  await expect(scene(page)).toHaveCount(0)
  await expect(page.locator('.recipe-app')).not.toHaveAttribute('inert')
  await page.getByRole('button', { name: '레몬 파운드 케이크 열기', exact: true }).click()
  await expect(page.getByRole('heading', { name: '레몬 파운드 케이크', exact: true })).toBeVisible()
})

test('a stalled image request cannot keep the app hidden', async ({ page }) => {
  await page.route('**/piggy-body*.png', () => {})
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(scene(page)).toHaveCount(0, { timeout: 4000 })
  await expect(page.locator('#main-content')).toBeFocused()
  await expect(page.getByRole('heading', { name: '나의 레시피 노트 1' })).toBeVisible()
})

test('the timer releases the page when CSS animation events never fire', async ({ page }) => {
  await page.clock.install()
  await page.goto('/')
  await expect(scene(page)).toHaveAttribute('data-ready', 'true')
  // Cancel motion without dispatching animationend, then advance the fallback timer.
  await page.evaluate(() => document.querySelector('.oven-entrance')!
    .getAnimations({ subtree: true }).forEach(animation => animation.cancel()))
  await page.clock.fastForward(5300)
  await expect(scene(page)).toHaveCount(0)
  await expect(page.locator('#main-content')).toBeFocused()
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
})

test('preserves saved recipes, photos, backups and deep links across entry and reload', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '나의 레시피 노트 1' })).toBeVisible()
  await expect(page.locator('.home-save [role="status"]')).toHaveAttribute('data-save-state', 'saved')
  const recipe = exampleRecipe()
  recipe.title = '시작 화면 이전의 레시피'
  recipe.cover = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9S8AAAAASUVORK5CYII='
  recipe.steps[0].photo = recipe.cover
  recipe.steps[0].tips = '이 사진과 팁을 유지해요.'
  const backup = makeBackup([recipe])
  await page.evaluate(async backup => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('oven-note', 1)
      request.onsuccess = () => {
        const db = request.result
        const transaction = db.transaction('journal', 'readwrite')
        transaction.objectStore('journal').put(backup, 'recipes')
        transaction.oncomplete = () => { db.close(); resolve() }
        transaction.onerror = () => reject(transaction.error)
      }
      request.onerror = () => reject(request.error)
    })
    sessionStorage.removeItem('oven-note:entrance-seen')
  }, backup)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto(`/#/recipe/${recipe.id}`)
  // Hash navigation keeps the current document; reload to read the seeded journal on entry.
  await page.reload()
  await expect(scene(page)).toHaveAttribute('data-ready', 'true')
  await page.getByRole('button', { name: '바로 들어가기' }).click()
  await expect(page.getByRole('heading', { name: recipe.title, exact: true })).toBeVisible()
  const hash = await page.evaluate(() => location.hash)
  await page.reload()
  await expect(scene(page)).toHaveCount(0)
  await expect(page.getByRole('heading', { name: recipe.title, exact: true })).toBeVisible()
  expect(await page.evaluate(() => location.hash)).toBe(hash)
  const stored = await page.evaluate(() => new Promise<unknown>((resolve, reject) => {
    const request = indexedDB.open('oven-note', 1)
    request.onsuccess = () => {
      const db = request.result
      const transaction = db.transaction('journal', 'readonly')
      const record = transaction.objectStore('journal').get('recipes')
      record.onsuccess = () => resolve(record.result)
      transaction.oncomplete = () => db.close()
    }
    request.onerror = () => reject(request.error)
  }))
  expect(stored).toMatchObject({ version: backup.version, recipes: backup.recipes })
})

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 1366, height: 768 },
  { width: 393, height: 852 },
  { width: 320, height: 568 },
]) {
  test(`keeps the peek behind the wall and fits the lettering and controls at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await expect(scene(page)).toHaveAttribute('data-ready', 'true')
    await sceneTime(page, 3800)
    const bounds = await page.evaluate(() => {
      const bounds = (selector: string) => {
        const { x, y, width, height } = document.querySelector(selector)!.getBoundingClientRect()
        return { x, y, width, height }
      }
      const body = document.querySelector<SVGGElement>('.piggy-body')!
      const point = (x: number, y: number) => {
        const p = new DOMPoint(x, y).matrixTransform(body.getScreenCTM()!)
        return { x: p.x, y: p.y }
      }
      return { logo: bounds('.piggy-lettering'), opening: bounds('.piggy-opening'), leftWall: bounds('.piggy-wall-left'), skip: bounds('.entrance-skip'),
        top: point(561, 60), foot: point(730, 1325), face: point(925, 550), hiddenFace: point(190, 550),
        clipped: getComputedStyle(document.querySelector('.piggy-opening')!).overflow,
        scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.querySelector('.oven-entrance')!.scrollHeight }
    })
    for (const item of [bounds.logo, bounds.skip]) {
      expect(item.x).toBeGreaterThanOrEqual(0)
      expect(item.y).toBeGreaterThanOrEqual(0)
      expect(item.x + item.width).toBeLessThanOrEqual(viewport.width + 1)
      expect(item.y + item.height).toBeLessThanOrEqual(viewport.height + 1)
    }
    expect(bounds.clipped).toBe('hidden')
    expect(bounds.leftWall.x + bounds.leftWall.width).toBeCloseTo(bounds.opening.x, 0)
    expect(bounds.hiddenFace.x).toBeLessThan(bounds.opening.x)
    expect(bounds.face.x).toBeGreaterThan(bounds.opening.x)
    expect(bounds.face.x).toBeLessThan(bounds.opening.x + bounds.opening.width)
    expect(bounds.top.y).toBeGreaterThan(0)
    expect(bounds.foot.y).toBeLessThan(viewport.height)
    // The logo stays above the pig on phones, beside it on wide screens.
    if (viewport.width < 600) expect(bounds.logo.y + bounds.logo.height).toBeLessThan(bounds.top.y)
    else expect(bounds.logo.x).toBeGreaterThan(bounds.face.x)
    expect(bounds.scrollWidth).toBeLessThanOrEqual(viewport.width)
    expect(bounds.scrollHeight).toBe(viewport.height)
  })
}
