import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowDownUp,
  Check,
  BookOpen,
  CircleAlert,
  Copy,
  Croissant,
  Heart,
  Flame,
  Pencil,
  LayoutGrid,
  LoaderCircle,
  Plus,
  ShoppingBasket,
  Trash2,
  X,
} from 'lucide-react'
import type { BakingStep, Recipe, Step } from './model'
import {
  copyWithNewIds,
  newRecipe,
  newStep,
  reorderSteps,
} from './model'
import { useJournal } from './useJournal'
import Dialog from './components/Dialog'
import HomePage from './components/HomePage'
import IngredientSummary from './components/IngredientSummary'
import PanelDialog from './components/PanelDialog'
import Pagination from './components/Pagination'
import RecipeDetails from './components/RecipeDetails'
import StepOrder from './components/StepOrder'
import StepCard from './components/StepCard'
import StepFocus from './components/StepFocus'
import piggyBody from './assets/piggy-revised/piggy-body.png'

const recipeName = (recipe: Recipe) => recipe.title.trim() || '이름 없는 레시피'
type Confirmation = {
  title: string
  description: string
  confirmLabel: string
  danger?: boolean
  action: () => void
}

function selectedFromHash() {
  try {
    return window.location.hash.startsWith('#/recipe/')
      ? decodeURIComponent(window.location.hash.slice(9))
      : ''
  } catch {
    return ''
  }
}

export default function App() {
  const { recipes, setRecipes, ready, saveState, error, syncStatus,
    privateRecipes, notice, sharePrivate, dismissSyncNotice } = useJournal()
  const [selectedId, setSelectedId] = useState(selectedFromHash)
  const [focusedStep, setFocusedStep] = useState<string | null>(null)
  const [focusTips, setFocusTips] = useState(false)
  const [panel, setPanel] = useState<'ingredients' | 'details' | 'order' | null>(null)
  const [gridPage, setGridPage] = useState(0)
  const [pageDirection, setPageDirection] = useState<'next' | 'previous' | null>(null)
  const openNewDetails = useRef(false)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null)
  const recipe = recipes.find((item) => item.id === selectedId)
  const pageSize = 1
  const pages = recipe ? recipe.steps.length : 1
  const page = Math.min(gridPage, pages - 1)
  const allSteps = recipe ? [...recipe.steps, recipe.baking] : []

  useEffect(() => {
    const handler = () => setSelectedId(selectedFromHash())
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])
  useEffect(() => {
    setFocusedStep(null)
    setFocusTips(false)
    setPanel(openNewDetails.current ? 'details' : null)
    openNewDetails.current = false
    setGridPage(0)
    setPageDirection(null)
    window.scrollTo(0, 0)
  }, [selectedId])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(timer)
  }, [toast])

  function notify(message: string, isError = false) {
    setToast({ message, error: isError })
  }
  function navigate(id = '') {
    const hash = id ? `#/recipe/${encodeURIComponent(id)}` : '#/'
    if (window.location.hash !== hash) window.location.hash = hash
    setSelectedId(id)
  }
  function updateRecipe(id: string, patch: Partial<Recipe> | ((item: Recipe) => Recipe)) {
    setRecipes((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...(typeof patch === 'function' ? patch(item) : { ...item, ...patch }),
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    )
  }
  function updateStep(stepId: string, patch: Partial<Step>) {
    if (!recipe) return
    updateRecipe(recipe.id, (item) => ({
      ...item,
      steps: item.steps.map((step) => (step.id === stepId ? { ...step, ...patch } : step)),
    }))
  }
  function updateBaking(patch: Partial<BakingStep>) {
    if (!recipe) return
    updateRecipe(recipe.id, (item) => ({ ...item, baking: { ...item.baking, ...patch } }))
  }
  function canCreate() {
    if (recipes.length < 500) return true
    notify('레시피는 최대 500개까지 보관할 수 있어요. 사용하지 않는 기록을 먼저 정리해 주세요.', true)
    return false
  }
  function createRecipe() {
    if (!canCreate()) return
    const created = newRecipe()
    setRecipes((current) => [created, ...current])
    openNewDetails.current = true
    navigate(created.id)
  }
  function duplicateRecipe() {
    if (!recipe || !canCreate()) return
    const copy = copyWithNewIds(recipe)
    copy.title = `${recipeName(recipe)} (사본)`.slice(0, 120)
    setRecipes((current) => [copy, ...current])
    navigate(copy.id)
    notify('사진과 굽기 회차까지 새 노트에 복사했어요.')
  }
  function addStep() {
    if (!recipe || recipe.steps.length >= 100) return
    const step = newStep()
    updateRecipe(recipe.id, (item) => ({ ...item, steps: [...item.steps, step] }))
    setGridPage(Math.floor(recipe.steps.length / pageSize))
    setFocusTips(false)
    setFocusedStep(step.id)
  }
  function moveStepTo(id: string, destination: number) {
    if (!recipe || reorderSteps(recipe.steps, id, destination) === recipe.steps) return
    updateRecipe(recipe.id, (item) => ({ ...item, steps: reorderSteps(item.steps, id, destination) }))
    setGridPage(destination)
  }
  function moveStep(id: string, direction: -1 | 1) {
    if (!recipe) return
    const index = recipe.steps.findIndex((step) => step.id === id)
    if (index >= 0) moveStepTo(id, index + direction)
  }
  function changeCard(next: number) {
    setPageDirection(next > page ? 'next' : 'previous')
    setGridPage(next)
  }
  function deleteStep(step: Step, index: number) {
    if (!recipe || recipe.steps.length <= 1) return
    setConfirmation({
      title: `${index + 1}단계를 삭제할까요?`,
      description: '이 단계에 적은 내용과 재료, 사진이 함께 삭제돼요.',
      confirmLabel: '단계 삭제',
      danger: true,
      action: () =>
        updateRecipe(recipe.id, (item) => ({
          ...item,
          steps: item.steps.filter((entry) => entry.id !== step.id),
        })),
    })
  }
  function closeFocus() {
    const id = focusedStep
    if (recipe && id) {
      const index = recipe.steps.findIndex((step) => step.id === id)
      if (index >= 0) setGridPage(Math.floor(index / pageSize))
    }
    setFocusedStep(null)
    setFocusTips(false)
    setTimeout(() => {
      if (!id) return
      if (id === recipe?.baking.id) {
        document.getElementById('open-baking')?.focus()
        return
      }
      const card = document.querySelector<HTMLElement>(
        `[data-step-id="${CSS.escape(id)}"] .step-open`,
      )
      card?.focus({ preventScroll: true })
    }, 0)
  }

  return (
    <div className="app-shell" data-ready={ready} data-save-state={saveState} data-sync-state={syncStatus}>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault()
          document.getElementById('main-content')?.focus()
        }}
      >
        본문으로 바로가기
      </a>
      <header className="site-header">
        <div className="header-inner page-width">
          <button className="brand" onClick={() => navigate()} aria-label="레시피 목록으로">
            <span className="brand-icon">
              <Croissant aria-hidden="true" size={29} strokeWidth={1.5} />
            </span>
            <span className="brand-wordmark">
              <strong>
                OVEN NOTE<span>.</span>
              </strong>
            </span>
          </button>

        </div>
      </header>
      {privateRecipes.length > 0 && <aside className="device-records-notice page-width" aria-label="이 기기의 이전 기록">
        <p>이 기기에만 저장했던 기록을 보관하고 있어요. 공유에 추가하면 모든 방문자가 보고 수정·삭제할 수 있어요.</p>
        <button type="button" className="button primary" onClick={sharePrivate}>
          기기 기록 {privateRecipes.length}개 공유에 추가
        </button>
      </aside>}
      {notice && <p className="sync-notice page-width" role="status">
        {notice}<button type="button" aria-label="동기화 알림 닫기" onClick={dismissSyncNotice}><X aria-hidden="true" size={14} /></button>
      </p>}
      {error && (
        <div role="alert" className="save-error page-width">
          <CircleAlert aria-hidden="true" size={18} />
          <p>{error}</p>
        </div>
      )}
      {!ready ? (
        <main id="main-content" className="loading-state" tabIndex={-1}>
          <LoaderCircle aria-hidden="true" className="spin" size={30} />
          <p>레시피 노트를 펼치고 있어요.</p>
        </main>
      ) : !selectedId ? (
        <HomePage
          recipes={recipes}
          saveState={saveState}
          onOpen={navigate}
          onCreate={createRecipe}
          onFavorite={(id) => updateRecipe(id, (item) => ({ ...item, favorite: !item.favorite }))}
          onCoverChange={(id, cover) => updateRecipe(id, { cover, coverPreset: null })}
          onError={(message) => notify(message, true)}
        />
      ) : !recipe ? (
        <main id="main-content" className="empty-results" tabIndex={-1}>
          <BookOpen aria-hidden="true" size={34} />
          <h1>이 레시피를 찾을 수 없어요</h1>
          <button className="button primary" onClick={() => navigate()}>
            목록으로 돌아가기
          </button>
        </main>
      ) : (
        <main id="main-content" className="editor-page page-width" tabIndex={-1}>
          <div className="editor-nav">
            <button className="text-button" onClick={() => navigate()}>
              <ArrowLeft aria-hidden="true" size={17} />
              목록으로
            </button>
            <div className="recipe-actions">
              <button
                className={`icon-button ${recipe.favorite ? 'is-favorite' : ''}`}
                aria-label={recipe.favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                aria-pressed={recipe.favorite}
                onClick={() => updateRecipe(recipe.id, { favorite: !recipe.favorite })}
              >
                <Heart
                  aria-hidden="true"
                  size={18}
                  fill={recipe.favorite ? 'currentColor' : 'none'}
                />
              </button>
              <button className="icon-button" aria-label="레시피 복제" onClick={duplicateRecipe}>
                <Copy aria-hidden="true" size={18} />
              </button>
              <button
                className="icon-button danger"
                aria-label="레시피 삭제"
                onClick={() =>
                  setConfirmation({
                    title: '이 레시피를 삭제할까요?',
                    description: `‘${recipeName(recipe)}’의 모든 단계와 사진이 함께 삭제돼요.`,
                    confirmLabel: '레시피 삭제',
                    danger: true,
                    action: () => {
                      setRecipes((current) => current.filter((item) => item.id !== recipe.id))
                      navigate()
                      notify('레시피를 삭제했어요.')
                    },
                  })
                }
              >
                <Trash2 aria-hidden="true" size={18} />
              </button>
            </div>
          </div>
          <header className="recipe-heading">
            <svg className="recipe-host" viewBox="140 20 840 820" aria-hidden="true" focusable="false">
              <defs>
                <clipPath id="recipe-host-face">
                  <rect x="140" y="20" width="840" height="520" />
                  <ellipse cx="560" cy="540" rx="400" ry="286" />
                </clipPath>
              </defs>
              <image href={piggyBody} width="1122" height="1402" clipPath="url(#recipe-host-face)" />
            </svg>
            <div className="recipe-heading-copy">
              <h1>{recipeName(recipe)}</h1>
            </div>
            <button className="button secondary" onClick={() => setPanel('details')}>
              <Pencil aria-hidden="true" size={16} />
              레시피 정보 수정
            </button>
          </header>
          <section className="recipe-steps" aria-labelledby="steps-title">
            <div className="steps-toolbar">
              <div className="steps-heading">
                <h2 id="steps-title">
                  <LayoutGrid aria-hidden="true" size={20} />
                  만드는 순서 <span className="count-badge">{recipe.steps.length}</span>
                </h2>
              </div>
              <div className="steps-actions">
                <button className="button secondary" aria-label="순서 변경" onClick={() => setPanel('order')}>
                  <ArrowDownUp aria-hidden="true" size={17} />순서 변경
                </button>
                <button className="button secondary" onClick={() => setPanel('ingredients')}>
                  <ShoppingBasket aria-hidden="true" size={17} />
                  전체 재료
                </button>
                <button id="open-baking" className="button secondary" onClick={() => {
                  setFocusTips(false)
                  setFocusedStep(recipe.baking.id)
                }}><Flame aria-hidden="true" size={17} />굽기</button>
                <button
                  className="button primary"
                  disabled={recipe.steps.length >= 100}
                  onClick={addStep}
                >
                  <Plus aria-hidden="true" size={17} />
                  단계 추가
                </button>
              </div>
            </div>
            <div className="step-grid single-step" data-direction={pageDirection}>
              {recipe.steps.slice(page, page + 1).map((step, localIndex) => {
                const index = page * pageSize + localIndex
                return (
                  <StepCard
                    key={step.id}
                    step={step}
                    index={index}
                    onOpen={() => {
                      setFocusTips(false)
                      setFocusedStep(step.id)
                    }}
                    onTips={() => {
                      setFocusTips(true)
                      setFocusedStep(step.id)
                    }}
                  />
                )
              })}
            </div>
            <Pagination page={page} pages={pages} label="단계 목록" onChange={changeCard} />
          </section>
          <footer className="editor-footer">
            <span>한 단계씩, 나만의 맛을 완성해요.</span>
            <span>나의 작은 베이킹 노트</span>
          </footer>
          {panel && (
            <PanelDialog
              title={panel === 'ingredients' ? '전체 재료' : panel === 'details' ? '레시피 정보' : '단계 순서 수정'}
              onClose={() => setPanel(null)}
            >
              {panel === 'ingredients' ? (
                <IngredientSummary steps={allSteps} servings={recipe.servings} />
              ) : panel === 'details' ? (
                <RecipeDetails recipe={recipe} onChange={(patch) => updateRecipe(recipe.id, patch)}
                  onError={(message) => notify(message, true)} error={error || (toast?.error ? toast.message : '')} />
              ) : (
                <StepOrder steps={recipe.steps} onMove={moveStep} onReorder={moveStepTo} onDelete={deleteStep} />
              )}
            </PanelDialog>
          )}
          {focusedStep && (
            <StepFocus
              key={`focus-${recipe.id}`}
              recipe={recipe}
              stepId={focusedStep}
              focusTips={focusTips}
              onSelect={setFocusedStep}
              onChange={updateStep}
              onBakingChange={updateBaking}
              onAddStep={addStep}
              onClose={closeFocus}
              onError={(message) => notify(message, true)}
              saveState={saveState}
              error={error || (toast?.error ? toast.message : '')}
            />
          )}
        </main>
      )}
      {confirmation && (
        <Dialog
          {...confirmation}
          onClose={() => setConfirmation(null)}
          onConfirm={() => {
            confirmation.action()
            setConfirmation(null)
          }}
        />
      )}
      {toast && !focusedStep && !panel && (
        <div
          className={`toast ${toast.error ? 'toast-error' : ''}`}
          role={toast.error ? 'alert' : 'status'}
        >
          {toast.error ? (
            <CircleAlert aria-hidden="true" size={18} />
          ) : (
            <Check aria-hidden="true" size={18} />
          )}
          <span>{toast.message}</span>
          <button className="icon-button" aria-label="알림 닫기" onClick={() => setToast(null)}>
            <X aria-hidden="true" size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
