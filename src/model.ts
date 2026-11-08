export const UNITS = ['g', 'kg', 'ml', 'L', '개', '작은술', '큰술', '컵', '꼬집', '적당량'] as const
export type Unit = (typeof UNITS)[number]

export interface Ingredient {
  id: string
  name: string
  quantity: string
  unit: Unit
}

export interface Step {
  id: string
  title: string
  instructions: string
  tips: string
  ingredients: Ingredient[]
  photo: string | null
}

export interface BakingRound {
  id: string
  temperature: string
  minutes: string
  note: string
}

export interface BakingStep extends Step {
  rounds: BakingRound[]
  preheating?: string
  panPosition?: string
  cooling?: string
}

export interface Recipe {
  id: string
  title: string
  description: string
  servings: string
  minutes: string
  temperature: string
  notes: string
  favorite: boolean
  cover: string | null
  coverPreset: 'lemon' | null
  createdAt: string
  updatedAt: string
  steps: Step[]
  baking: BakingStep
}

export const uid = () => crypto.randomUUID()
export const newIngredient = (): Ingredient => ({ id: uid(), name: '', quantity: '', unit: 'g' })
export const newStep = (): Step => ({
  id: uid(),
  title: '',
  instructions: '',
  tips: '',
  ingredients: [],
  photo: null,
})

export const newBakingRound = (): BakingRound => ({
  id: uid(),
  temperature: '',
  minutes: '',
  note: '',
})

export const newBakingStep = (): BakingStep => ({
  ...newStep(),
  title: '오븐에서 굽기',
  rounds: [newBakingRound()],
})

export function bakingMinutes(rounds: BakingRound[]): number {
  return (
    Math.round(rounds.reduce((total, round) => total + Number(round.minutes || 0), 0) * 100) / 100
  )
}

export function validBakingNumber(value: string, max: number): boolean {
  return (
    value === '' ||
    (value.length <= 10 &&
      /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) &&
      Number(value) >= 0 &&
      Number(value) <= max)
  )
}

export function newRecipe(): Recipe {
  const now = new Date().toISOString()
  return {
    id: uid(),
    title: '',
    description: '',
    servings: '',
    minutes: '',
    temperature: '',
    notes: '',
    favorite: false,
    cover: null,
    coverPreset: null,
    createdAt: now,
    updatedAt: now,
    steps: [newStep()],
    baking: newBakingStep(),
  }
}

export function exampleRecipe(): Recipe {
  const ingredient = (name: string, quantity: string, unit: Unit = 'g'): Ingredient => ({
    id: uid(),
    name,
    quantity,
    unit,
  })
  return {
    ...newRecipe(),
    title: '레몬 파운드 케이크',
    description: '포근한 버터 향에 상큼한 레몬 한 스푼.\n느긋한 주말에 굽고 싶은 나의 레시피.',
    servings: '8조각',
    minutes: '55',
    temperature: '170',
    coverPreset: 'lemon',
    notes:
      '버터와 달걀은 굽기 1시간 전에 꺼내 실온에 두어요.\n오븐마다 온도가 다르니, 35분부터 꼬치로 속을 확인해 주세요.',
    baking: {
      ...newBakingStep(),
      instructions:
        '오븐을 충분히 예열한 뒤 반죽을 넣어요. 두 번째 굽기에서는 온도를 낮춰 속까지 익혀 주세요. 꼬치로 익은 상태를 확인하고, 완전히 식힌 뒤 준비한 글레이즈를 올려요.',
      rounds: [
        {
          ...newBakingRound(),
          temperature: '170',
          minutes: '25',
          note: '예열한 오븐의 가운데 단에 놓아요.',
        },
        {
          ...newBakingRound(),
          temperature: '160',
          minutes: '15',
          note: '온도를 낮추고 속까지 익혀요.',
        },
      ],
    },
    steps: [
      {
        ...newStep(),
        title: '버터와 설탕 섞기',
        instructions:
          '실온에 둔 버터를 부드럽게 풀어 주세요. 설탕을 넣고 색이 밝아질 때까지 충분히 휘핑해요.',
        ingredients: [ingredient('무염버터', '120'), ingredient('설탕', '100')],
      },
      {
        ...newStep(),
        title: '반죽 만들기',
        instructions:
          '달걀을 조금씩 넣어 섞고, 체 친 가루를 넣어요. 우유와 레몬즙을 더한 뒤 주걱으로 가볍게 섞어 주세요.',
        ingredients: [
          ingredient('달걀', '2', '개'),
          ingredient('박력분', '140'),
          ingredient('베이킹파우더', '3'),
          ingredient('우유', '30', 'ml'),
          ingredient('레몬즙', '20', 'ml'),
        ],
      },
      {
        ...newStep(),
        title: '틀과 글레이즈 준비하기',
        instructions:
          '유산지를 깐 틀에 반죽을 담고 윗면을 정리해요. 슈가파우더와 레몬즙은 매끈하게 섞어 두었다가, 다 구운 케이크가 완전히 식으면 올려 주세요.',
        ingredients: [ingredient('슈가파우더', '60'), ingredient('레몬즙', '10', 'ml')],
      },
    ],
  }
}

export interface TotalIngredient {
  key: string
  name: string
  quantity: number
  unit: Unit
  unspecified: boolean
  hasQuantity: boolean
}

export function validQuantity(value: string): boolean {
  return (
    value.trim() === '' ||
    (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) &&
      Number.isFinite(Number(value)) &&
      Number(value) >= 0 &&
      Number(value) <= 1_000_000)
  )
}

export function totalIngredients(steps: Step[], multiplier = 1): TotalIngredient[] {
  const totals = new Map<string, TotalIngredient>()
  for (const step of steps) {
    for (const ingredient of step.ingredients) {
      const name = ingredient.name.trim().replace(/\s+/g, ' ')
      if (!name) continue
      const unit = ingredient.unit === 'kg' ? 'g' : ingredient.unit === 'L' ? 'ml' : ingredient.unit
      const factor = ingredient.unit === 'kg' || ingredient.unit === 'L' ? 1000 : 1
      const key = `${name.toLocaleLowerCase('ko-KR')}::${unit}`
      const total = totals.get(key) ?? {
        key,
        name,
        quantity: 0,
        unit,
        unspecified: false,
        hasQuantity: false,
      }
      if (!ingredient.quantity.trim() || !validQuantity(ingredient.quantity) || unit === '적당량') {
        total.unspecified = true
      } else {
        total.quantity += Number(ingredient.quantity) * factor * multiplier
        total.hasQuantity = true
      }
      totals.set(key, total)
    }
  }
  return Array.from(totals.values(), (total) => ({
    ...total,
    quantity: Math.round(total.quantity * 10000) / 10000,
  }))
}

export const formatAmount = (value: number) =>
  new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 4 }).format(value)

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function string(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length > max)
    throw new Error('백업 파일에 올바르지 않은 항목이 있어요.')
  return value
}

function photo(value: unknown): string | null {
  if (value === null) return null
  if (
    typeof value !== 'string' ||
    value.length > 4_000_000 ||
    !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(value)
  ) {
    throw new Error('백업 파일의 사진 형식을 확인해 주세요.')
  }
  return value
}

function uniqueIds(items: { id: string }[]): void {
  if (
    items.some((item) => !item.id) ||
    new Set(items.map((item) => item.id)).size !== items.length
  ) {
    throw new Error('백업 파일의 항목 ID가 올바르지 않아요.')
  }
}

export function parseBackup(value: unknown): Recipe[] {
  if (
    !isObject(value) ||
    (value.version !== 1 && value.version !== 2) ||
    !Array.isArray(value.recipes) ||
    value.recipes.length > 500
  ) {
    throw new Error('오븐 노트에서 내보낸 백업 파일을 선택해 주세요.')
  }
  const recipes = value.recipes.map((recipe): Recipe => {
    if (
      !isObject(recipe) ||
      !Array.isArray(recipe.steps) ||
      recipe.steps.length < 1 ||
      recipe.steps.length > 100
    ) {
      throw new Error('레시피에는 1~100개의 단계가 필요해요.')
    }
    const parseStep = (step: unknown): Step => {
      if (!isObject(step) || !Array.isArray(step.ingredients) || step.ingredients.length > 100)
        throw new Error('단계의 재료 목록이 올바르지 않아요.')
      const ingredients = step.ingredients.map((item): Ingredient => {
        if (!isObject(item) || !UNITS.includes(item.unit as Unit))
          throw new Error('재료의 단위가 올바르지 않아요.')
        const quantity = string(item.quantity, 32)
        if (!validQuantity(quantity))
          throw new Error('재료의 분량은 0 이상의 숫자로 입력해 주세요.')
        return {
          id: string(item.id, 100),
          name: string(item.name, 100),
          quantity,
          unit: item.unit as Unit,
        }
      })
      uniqueIds(ingredients)
      return {
        id: string(step.id, 100),
        title: string(step.title, 120),
        instructions: string(step.instructions, 10000),
        tips: step.tips === undefined ? '' : string(step.tips, 10000),
        ingredients,
        photo: photo(step.photo),
      }
    }
    let steps = recipe.steps.map(parseStep)
    uniqueIds(steps)
    let baking: BakingStep
    if (value.version === 1) {
      // Only explicitly titled oven steps are moved. Keep every field, including photos and ingredients.
      const ovenSteps = steps.filter((step) =>
        /^(?:노릇하게\s*)?굽기$|^오븐(?:에서|에)\s*굽기$/.test(step.title.trim()),
      )
      const ovenStep = ovenSteps.length === 1 ? ovenSteps[0] : undefined
      const temperature =
        typeof recipe.temperature === 'string' && validBakingNumber(recipe.temperature, 500)
          ? recipe.temperature
          : ''
      baking = { ...(ovenStep ?? newBakingStep()), rounds: [{ ...newBakingRound(), temperature }] }
      if (ovenStep) steps = steps.filter((step) => step.id !== ovenStep.id)
      if (!steps.length) steps = [newStep()]
    } else {
      if (
        !isObject(recipe.baking) ||
        !Array.isArray(recipe.baking.rounds) ||
        recipe.baking.rounds.length < 1 ||
        recipe.baking.rounds.length > 30
      )
        throw new Error('굽기는 1~30회로 나눠 기록할 수 있어요.')
      const rounds = recipe.baking.rounds.map((round): BakingRound => {
        if (!isObject(round)) throw new Error('굽기 회차가 올바르지 않아요.')
        const temperature = string(round.temperature, 10)
        const minutes = string(round.minutes, 10)
        if (!validBakingNumber(temperature, 500) || !validBakingNumber(minutes, 1440))
          throw new Error('굽기 온도 또는 시간을 확인해 주세요.')
        return { id: string(round.id, 100), temperature, minutes, note: string(round.note, 1000) }
      })
      uniqueIds(rounds)
      const guidance: Pick<BakingStep, 'preheating' | 'panPosition' | 'cooling'> = {}
      for (const field of ['preheating', 'panPosition', 'cooling'] as const) {
        if (recipe.baking[field] !== undefined) guidance[field] = string(recipe.baking[field], 10000)
      }
      baking = { ...parseStep(recipe.baking), rounds, ...guidance }
    }
    uniqueIds([...steps, baking])
    if (
      typeof recipe.favorite !== 'boolean' ||
      (recipe.coverPreset !== null && recipe.coverPreset !== 'lemon')
    )
      throw new Error('레시피 설정이 올바르지 않아요.')
    const createdAt = string(recipe.createdAt, 40)
    const updatedAt = string(recipe.updatedAt, 40)
    if (!Number.isFinite(Date.parse(createdAt)) || !Number.isFinite(Date.parse(updatedAt)))
      throw new Error('레시피 날짜가 올바르지 않아요.')
    return {
      id: string(recipe.id, 100),
      title: string(recipe.title, 120),
      description: string(recipe.description, 2000),
      servings: string(recipe.servings, 40),
      minutes: string(recipe.minutes, 10),
      temperature: string(recipe.temperature, 10),
      notes: string(recipe.notes, 20000),
      favorite: recipe.favorite,
      cover: photo(recipe.cover),
      coverPreset: recipe.coverPreset,
      createdAt,
      updatedAt,
      steps,
      baking,
    }
  })
  uniqueIds(recipes)
  return recipes
}

export const makeBackup = (recipes: Recipe[]) => ({
  version: 2,
  exportedAt: new Date().toISOString(),
  recipes,
})

export function copyWithNewIds(recipe: Recipe): Recipe {
  const now = new Date().toISOString()
  return {
    ...recipe,
    id: uid(),
    createdAt: now,
    updatedAt: now,
    steps: recipe.steps.map((step) => ({
      ...step,
      id: uid(),
      ingredients: step.ingredients.map((item) => ({ ...item, id: uid() })),
    })),
    baking: {
      ...recipe.baking,
      id: uid(),
      ingredients: recipe.baking.ingredients.map((item) => ({ ...item, id: uid() })),
      rounds: recipe.baking.rounds.map((round) => ({ ...round, id: uid() })),
    },
  }
}

export function reorderSteps(steps: Step[], id: string, destination: number): Step[] {
  const index = steps.findIndex((step) => step.id === id)
  if (index < 0 || !Number.isInteger(destination) || destination < 0 || destination >= steps.length || index === destination) return steps
  const reordered = [...steps]
  const [moving] = reordered.splice(index, 1)
  reordered.splice(destination, 0, moving)
  return reordered
}
