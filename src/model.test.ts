import { describe, expect, it } from 'vitest'
import {
  copyWithNewIds,
  bakingMinutes,
  exampleRecipe,
  makeBackup,
  newIngredient,
  newBakingRound,
  newStep,
  parseBackup,
  reorderSteps,
  totalIngredients,
  validQuantity,
  validBakingNumber,
} from './model'
import type { Unit } from './model'

const ingredient = (name: string, quantity: string, unit: Unit = 'g') => ({
  ...newIngredient(),
  name,
  quantity,
  unit,
})

describe('ingredient totals', () => {
  it('combines ingredients across steps and converts mass and volume independently', () => {
    const totals = totalIngredients([
      {
        ...newStep(),
        ingredients: [ingredient('설탕', '0.1', 'kg'), ingredient('우유', '0.5', 'L')],
      },
      {
        ...newStep(),
        ingredients: [
          ingredient(' 설탕 ', '20'),
          ingredient('우유', '30', 'ml'),
          ingredient('설탕', '1', '큰술'),
        ],
      },
    ])
    expect(totals.map(({ name, quantity, unit }) => ({ name, quantity, unit }))).toEqual([
      { name: '설탕', quantity: 120, unit: 'g' },
      { name: '우유', quantity: 530, unit: 'ml' },
      { name: '설탕', quantity: 1, unit: '큰술' },
    ])
  })
  it('scales decimal quantities without changing source recipes', () => {
    const steps = [
      { ...newStep(), ingredients: [ingredient('소금', '0.1'), ingredient('소금', '0.2')] },
    ]
    expect(totalIngredients(steps, 1.5)[0].quantity).toBe(0.45)
    expect(steps[0].ingredients[0].quantity).toBe('0.1')
  })
  it('does not misrepresent missing quantities as zero', () => {
    const totals = totalIngredients([
      {
        ...newStep(),
        ingredients: [
          ingredient('설탕', ''),
          ingredient('설탕', '20'),
          ingredient('소금', '', '적당량'),
          ingredient('', '300'),
        ],
      },
    ])
    expect(totals).toHaveLength(2)
    expect(totals[0]).toMatchObject({ quantity: 20, unspecified: true, hasQuantity: true })
    expect(totals[1]).toMatchObject({ hasQuantity: false, unspecified: true })
  })
  it('aggregates the example lemon juice from both steps', () => {
    expect(
      totalIngredients(exampleRecipe().steps).find((item) => item.name === '레몬즙'),
    ).toMatchObject({ quantity: 30, unit: 'ml' })
  })
  it('rejects invalid and unbounded quantities', () => {
    for (const amount of ['-2', 'NaN', 'Infinity', '1e30', '1000001', ' 2 '])
      expect(validQuantity(amount)).toBe(false)
    for (const amount of ['', '0', '0.25', '.5', '1000000'])
      expect(validQuantity(amount)).toBe(true)
  })
})

describe('portable backups', () => {
  it('round trips all recipe fields including photos and notes', () => {
    const recipe = exampleRecipe()
    recipe.steps[0].tips = '버터는 실온에 두어요.'
    recipe.baking.tips = '완전히 식힌 뒤 잘라요.'
    recipe.cover = 'data:image/jpeg;base64,YWJj'
    recipe.steps[0].photo = 'data:image/png;base64,YWJj'
    recipe.baking.photo = 'data:image/jpeg;base64,YWJj'
    recipe.baking.ingredients.push(ingredient('버터', '5'))
    expect(makeBackup([recipe]).version).toBe(2)
    expect(parseBackup(JSON.parse(JSON.stringify(makeBackup([recipe]))))).toEqual([recipe])
  })
  it('imports independent copies with new nested IDs', () => {
    const original = exampleRecipe()
    original.steps[0].tips = '너무 오래 섞지 않아요.'
    original.baking.tips = '틀에서 잠시 식혀요.'
    const copy = copyWithNewIds(original)
    expect(copy.id).not.toBe(original.id)
    expect(copy.steps[0].id).not.toBe(original.steps[0].id)
    expect(copy.steps[0].ingredients[0].id).not.toBe(original.steps[0].ingredients[0].id)
    expect(copy.title).toBe(original.title)
    expect(copy.steps[0].tips).toBe(original.steps[0].tips)
    expect(copy.baking.tips).toBe(original.baking.tips)
    expect(copy.baking.id).not.toBe(original.baking.id)
    expect(copy.baking.rounds[0].id).not.toBe(original.baking.rounds[0].id)
    copy.baking.rounds[0].minutes = '10'
    expect(original.baking.rounds[0].minutes).toBe('25')
  })
  it('rejects malformed data, unsafe image sources, and duplicate IDs before import', () => {
    expect(() => parseBackup({ version: 99, recipes: [] })).toThrow()
    const original = exampleRecipe()
    expect(() =>
      parseBackup(makeBackup([{ ...original, cover: 'https://example.com/image.png' }])),
    ).toThrow()
    expect(() =>
      parseBackup(makeBackup([{ ...original, cover: 'data:image/svg+xml;base64,YWJj' }])),
    ).toThrow()
    expect(() => parseBackup(makeBackup([original, original]))).toThrow()
    expect(() => parseBackup(makeBackup([{ ...original, steps: [] }]))).toThrow()
    original.steps[0].ingredients[0].quantity = '-1'
    expect(() => parseBackup(makeBackup([original]))).toThrow()
  })
  it('loads older records without tips while preserving methods and photos', () => {
    const original = exampleRecipe()
    original.steps[0].photo = 'data:image/png;base64,YWJj'
    const legacy = JSON.parse(JSON.stringify(makeBackup([original])))
    for (const step of [...legacy.recipes[0].steps, legacy.recipes[0].baking]) delete step.tips
    expect(parseBackup(legacy)).toEqual([original])
  })
  it('rejects invalid tips instead of silently losing them during import', () => {
    for (const tips of [null, 42, 'x'.repeat(10001)]) {
      const backup = JSON.parse(JSON.stringify(makeBackup([exampleRecipe()])))
      backup.recipes[0].steps[0].tips = tips
      expect(() => parseBackup(backup)).toThrow()
      backup.recipes[0].steps[0].tips = ''
      backup.recipes[0].baking.tips = tips
      expect(() => parseBackup(backup)).toThrow()
    }
  })
  it('retains an intentionally empty journal', () => {
    expect(parseBackup(makeBackup([]))).toEqual([])
  })
})

describe('baking rounds and existing journals', () => {
  it('preserves structured baking guidance and legacy notes across backup and duplication', () => {
    const original = exampleRecipe()
    original.baking.tips = '이전 팁을 보존해요.'
    expect(parseBackup(makeBackup([original]))[0].baking.preheating).toBeUndefined()
    Object.assign(original.baking, {
      preheating: '180도로 15분 예열해요.', panPosition: '아래에서 두 번째 칸', cooling: '틀에서 5분 식힌 뒤 식힘망에 올려요.',
    })
    const restored = parseBackup(makeBackup([original]))[0]
    expect(restored).toEqual(original)
    expect(copyWithNewIds(restored).baking).toMatchObject({
      preheating: original.baking.preheating, panPosition: original.baking.panPosition,
      cooling: original.baking.cooling, instructions: original.baking.instructions, tips: original.baking.tips,
    })
  })
  it('rejects malformed structured baking guidance without dropping other data', () => {
    for (const field of ['preheating', 'panPosition', 'cooling']) {
      for (const invalid of [null, 42, 'x'.repeat(10001)]) {
        const backup = JSON.parse(JSON.stringify(makeBackup([exampleRecipe()])))
        backup.recipes[0].baking[field] = invalid
        expect(() => parseBackup(backup)).toThrow()
      }
    }
  })
  it('totals all baking rounds while leaving blank times unspecified', () => {
    const rounds = ['25', '10.5', '', '0'].map((minutes) => ({ ...newBakingRound(), minutes }))
    expect(bakingMinutes(rounds)).toBe(35.5)
    expect(validBakingNumber('', 500)).toBe(true)
    expect(validBakingNumber('0', 500)).toBe(true)
    expect(validBakingNumber('175.5', 500)).toBe(true)
    for (const value of ['-1', '501', 'Infinity', '1e2', '0.000000000001'])
      expect(validBakingNumber(value, 500)).toBe(false)
  })
  it('moves one explicit legacy baking step last without losing photos, ingredients, or instructions', () => {
    const original = exampleRecipe()
    const oven = {
      ...newStep(),
      title: '노릇하게 굽기',
      instructions: '170도에서 40분. 식힌 뒤 마무리해요.',
      photo: 'data:image/png;base64,YWJj',
      ingredients: [ingredient('버터', '5')],
    }
    const legacySteps = [original.steps[0], oven, original.steps[1]]
    const [migrated] = parseBackup({
      version: 1,
      recipes: [{ ...original, baking: undefined, steps: legacySteps }],
    })
    expect(migrated.steps).toEqual([original.steps[0], original.steps[1]])
    expect(migrated.baking).toMatchObject(oven)
    expect(migrated.baking.rounds[0]).toMatchObject({ temperature: '170', minutes: '', note: '' })
    expect(migrated.minutes).toBe('55')
    expect(migrated.coverPreset).toBe(original.coverPreset)
    expect(migrated.notes).toBe(original.notes)
    expect(parseBackup(makeBackup([migrated]))).toEqual([migrated])
  })
  it('preserves ambiguous legacy steps and does not infer oven time from total recipe duration', () => {
    const original = exampleRecipe()
    const steps = [
      { ...newStep(), title: '1차 굽기', instructions: '첫 굽기' },
      { ...newStep(), title: '2차 굽기', instructions: '마지막 굽기' },
    ]
    const [migrated] = parseBackup({
      version: 1,
      recipes: [{ ...original, steps, baking: undefined }],
    })
    expect(migrated.steps).toEqual(steps)
    expect(migrated.baking.rounds[0].minutes).toBe('')
    expect(migrated.minutes).toBe('55')
  })
  it('rejects invalid baking rounds and duplicate step or round IDs', () => {
    const original = exampleRecipe()
    const invalidRounds = [
      [],
      [{ ...newBakingRound(), temperature: '501' }],
      [{ ...newBakingRound(), minutes: '-1' }],
      [{ ...newBakingRound(), minutes: '1441' }],
      [original.baking.rounds[0], original.baking.rounds[0]],
      Array.from({ length: 31 }, newBakingRound),
    ]
    for (const rounds of invalidRounds)
      expect(() =>
        parseBackup(makeBackup([{ ...original, baking: { ...original.baking, rounds } }])),
      ).toThrow()
    expect(() =>
      parseBackup(
        makeBackup([{ ...original, baking: { ...original.baking, id: original.steps[0].id } }]),
      ),
    ).toThrow()
  })
})


describe('step reordering', () => {
  it('moves across multiple positions without changing step content or the source order', () => {
    const recipe = exampleRecipe()
    recipe.steps[0].tips = '첫 단계 팁'
    recipe.steps[0].photo = 'data:image/png;base64,YWJj'
    const before = structuredClone(recipe.steps)
    const next = reorderSteps(recipe.steps, recipe.steps[0].id, 2)
    expect(next.map((step) => step.id)).toEqual([before[1].id, before[2].id, before[0].id])
    expect(next[2]).toBe(recipe.steps[0])
    expect(recipe.steps).toEqual(before)
    expect(reorderSteps(next, before[0].id, 0)).toEqual(before)
    expect(parseBackup(makeBackup([{ ...recipe, steps: next }]))[0].steps).toEqual(next)
  })
  it('keeps the order for missing IDs, unchanged positions, and invalid destinations', () => {
    const steps = exampleRecipe().steps
    for (const destination of [-1, steps.length, 0.5, NaN, 0])
      expect(reorderSteps(steps, steps[0].id, destination)).toBe(steps)
    expect(reorderSteps(steps, 'missing', 1)).toBe(steps)
  })
})
