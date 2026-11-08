import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  Flame,
  LayoutGrid,
  LoaderCircle,
  Plus,
  Thermometer,
  Timer,
  Trash2,
} from 'lucide-react'
import type { BakingRound, BakingStep, Recipe, Step } from '../model'
import { bakingMinutes, formatAmount, newBakingRound, validBakingNumber } from '../model'
import IngredientFields from './IngredientFields'
import PhotoPicker from './PhotoPicker'

export default function StepFocus({
  recipe,
  stepId,
  focusTips = false,
  onSelect,
  onChange,
  onBakingChange,
  onAddStep,
  onClose,
  onError,
  saveState,
  error,
}: {
  recipe: Recipe
  stepId: string
  focusTips?: boolean
  onSelect: (id: string) => void
  onChange: (id: string, patch: Partial<Step>) => void
  onBakingChange: (patch: Partial<BakingStep>) => void
  onAddStep: () => void
  onClose: () => void
  onError: (message: string) => void
  saveState: 'loading' | 'saving' | 'saved' | 'error'
  error: string
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [direction, setDirection] = useState<'next' | 'previous' | null>(null)
  const tipsInput = useRef<HTMLTextAreaElement>(null)
  const titleInput = useRef<HTMLInputElement>(null)
  const addingStep = useRef(false)
  const baking = stepId === recipe.baking.id
  const allSteps = baking ? [recipe.baking] : recipe.steps
  const index = allSteps.findIndex((step) => step.id === stepId)
  const step = allSteps[index]
  const label = baking ? '굽기' : `${index + 1}단계`
  useEffect(() => {
    dialog.current?.showModal()
    if (focusTips) tipsInput.current?.focus()
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [])
  useEffect(() => {
    if (addingStep.current) {
      addingStep.current = false
      titleInput.current?.focus()
    }
  }, [stepId])
  const update = (patch: Partial<Step>) =>
    baking ? onBakingChange(patch) : onChange(stepId, patch)
  function selectStep(id: string) {
    setDirection(allSteps.findIndex((item) => item.id === id) > index ? 'next' : 'previous')
    onSelect(id)
  }
  if (!step) return null
  return (
    <dialog
      ref={dialog}
      className={`step-dialog ${baking ? 'is-baking' : ''}`}
      aria-label="단계 전체 화면"
      onCancel={onClose}
      onKeyDown={(event) => {
        if ((event.target as HTMLElement).closest('input,textarea,select,button')) return
        if (event.key === 'ArrowRight' && index < allSteps.length - 1) {
          event.preventDefault()
          selectStep(allSteps[index + 1].id)
        }
        if (event.key === 'ArrowLeft' && index > 0) {
          event.preventDefault()
          selectStep(allSteps[index - 1].id)
        }
      }}
    >
      <header className="focus-header">
        <button className="button secondary" autoFocus onClick={onClose}>
          <LayoutGrid aria-hidden="true" size={17} />
          순서로 돌아가기
        </button>
        <p>{recipe.title || '이름 없는 레시피'}</p>
        <span className="focus-save" role="status">
          {saveState === 'saved' ? (
            <Check aria-hidden="true" size={15} />
          ) : saveState === 'error' ? (
            <CircleAlert aria-hidden="true" size={15} />
          ) : (
            <LoaderCircle aria-hidden="true" className="spin" size={15} />
          )}
          {saveState === 'saved'
            ? '자동 저장됨'
            : saveState === 'error'
              ? '저장 오류'
              : '저장하는 중…'}
        </span>
      </header>
      <div className="focus-body" key={step.id} data-direction={direction}>
        {error && (
          <div className="focus-error" role="alert">
            <CircleAlert aria-hidden="true" size={17} />
            <span>{error}</span>
          </div>
        )}
        <div className="focus-title-row">
          <span className="focus-number">
            {baking ? <Flame aria-hidden="true" size={31} /> : String(index + 1).padStart(2, '0')}
          </span>
          <div>
            {baking && <span className="eyebrow">굽기 기록</span>}
            <input
              ref={titleInput}
              className="focus-title"
              aria-label={`${label} 제목`}
              value={step.title}
              maxLength={120}
              placeholder={baking ? '오븐에서 굽기' : '어떤 단계인가요?'}
              onChange={(event) => update({ title: event.target.value })}
            />
          </div>
          {baking && (
            <span className="oven-total">
              총 굽는 시간
              <strong>
                {recipe.baking.rounds.some((round) => round.minutes !== '')
                  ? formatAmount(bakingMinutes(recipe.baking.rounds))
                  : '—'}
                <small>분</small>
              </strong>
            </span>
          )}
        </div>
        <div className="focus-columns">
          <section className="focus-main-panel">
            {baking ? (
              <BakingRounds baking={recipe.baking} onChange={onBakingChange} onError={onError} />
            ) : (
              <>
                <label className="editor-label" htmlFor="step-instructions">
                  만드는 방법
                </label>
                <textarea
                  id="step-instructions"
                  className="focus-instructions"
                  value={step.instructions}
                  maxLength={10000}
                  aria-label={`${label} 만드는 방법`}
                  placeholder="어떻게 만드는지 차근차근 적어 보세요."
                  onChange={(event) => update({ instructions: event.target.value })}
                />
              </>
            )}
            {!baking && (
              <div className="step-tips">
                <label className="editor-label" htmlFor="step-tips">
                  {label} 팁 (선택)
                </label>
                <textarea
                  ref={tipsInput}
                  id="step-tips"
                  className="tips-input"
                  value={step.tips}
                  maxLength={10000}
                  aria-label={`${label} 팁`}
                  placeholder="이 단계에서 주의할 점이나 나만의 요령을 적어 보세요."
                  onChange={(event) => update({ tips: event.target.value })}
                />
              </div>
            )}
            <div className="focus-photo">
              <span className="editor-label">{baking ? '구워진 모습' : '과정 사진'}</span>
              <PhotoPicker
                value={step.photo}
                label={`${label} 사진`}
                onChange={(photo) => update({ photo })}
                onError={onError}
              />
            </div>
          </section>
          <section className="focus-side-panel">
            {baking && (['preheating', 'panPosition', 'cooling'] as const).map((field) => {
              const fieldLabel = { preheating: '예열', panPosition: '틀 위치', cooling: '식히는 방법' }[field]
              return (
                <div className="baking-note baking-guidance" key={field}>
                  <label className="editor-label" htmlFor={`baking-${field}`}>{fieldLabel}</label>
                  <textarea id={`baking-${field}`} aria-label={`굽기 ${fieldLabel}`}
                    rows={3} maxLength={10000} value={recipe.baking[field] ?? ''}
                    onChange={(event) => onBakingChange({ [field]: event.target.value })} />
                </div>
              )
            })}
            {baking && (step.instructions || step.tips) && (
              <details className="legacy-baking-notes">
                <summary>기존 메모·팁</summary>
            {baking && (
              <div className="baking-note">
                <label className="editor-label" htmlFor="baking-instructions">
                  굽기 & 마무리 메모
                </label>
                <textarea
                  id="baking-instructions"
                  value={step.instructions}
                  maxLength={10000}
                  aria-label="굽기 만드는 방법"
                  placeholder="예열, 틀의 위치, 식히는 방법 등을 기록해 보세요."
                  onChange={(event) => update({ instructions: event.target.value })}
                />
              </div>
            )}
            {baking && (
              <div className="baking-note">
                <label className="editor-label" htmlFor="baking-tips">
                  굽기 단계 팁 (선택)
                </label>
                <textarea
                  ref={tipsInput}
                  id="baking-tips"
                  value={step.tips}
                  maxLength={10000}
                  aria-label="굽기 팁"
                  placeholder="굽기나 식힐 때 알아두면 좋은 요령을 적어 보세요."
                  onChange={(event) => update({ tips: event.target.value })}
                />
              </div>
            )}
              </details>
            )}
            <IngredientFields
              ingredients={step.ingredients}
              label={label}
              onChange={(ingredients) => update({ ingredients })}
              onError={onError}
            />
          </section>
        </div>
      </div>
      <footer className="focus-footer">
        <button
          className="button secondary"
          disabled={index === 0}
          onClick={() => selectStep(allSteps[index - 1].id)}
        >
          <ArrowLeft aria-hidden="true" size={17} />
          이전 단계
        </button>
        <span className="focus-position">
          {baking ? '굽기' : <><b>{String(index + 1).padStart(2, '0')}</b> / {String(allSteps.length).padStart(2, '0')}</>}
          <small>{baking ? '온도와 시간을 기록하세요' : '나만의 맛을 완성하는 중'}</small>
        </span>
        <button
          className="button primary"
          disabled={!baking && index === allSteps.length - 1 && recipe.steps.length >= 100}
          title={!baking && index === allSteps.length - 1 && recipe.steps.length >= 100
            ? '준비 단계는 최대 100개까지 작성할 수 있어요.' : undefined}
          onClick={() => {
            if (baking) onClose()
            else if (index < allSteps.length - 1) selectStep(allSteps[index + 1].id)
            else {
              addingStep.current = true
              setDirection('next')
              onAddStep()
            }
          }}
        >
          {baking ? '완료하고 돌아가기' : '다음 단계'}
          {baking ? (
            <Check aria-hidden="true" size={17} />
          ) : (
            <ArrowRight aria-hidden="true" size={17} />
          )}
        </button>
      </footer>
    </dialog>
  )
}

function BakingRounds({
  baking,
  onChange,
  onError,
}: {
  baking: BakingStep
  onChange: (patch: Partial<BakingStep>) => void
  onError: (message: string) => void
}) {
  function updateRound(id: string, patch: Partial<BakingRound>) {
    onChange({
      rounds: baking.rounds.map((round) => (round.id === id ? { ...round, ...patch } : round)),
    })
  }
  return (
    <section className="baking-rounds" aria-label="굽기 회차">
      <div className="field-heading">
        <Flame aria-hidden="true" size={20} />
        <h3>나누어 굽는 시간</h3>
      </div>
      <p className="field-help">온도를 바꾸거나 나누어 구울 때, 칸을 추가해 주세요.</p>
      {baking.rounds.map((round, index) => (
        <div className="baking-round" key={round.id}>
          <div className="round-top">
            <span className="round-badge">{index + 1}차 굽기</span>
            <button
              className="icon-button danger"
              disabled={baking.rounds.length === 1}
              aria-label={`${index + 1}차 굽기 삭제`}
              onClick={() =>
                onChange({ rounds: baking.rounds.filter((item) => item.id !== round.id) })
              }
            >
              <Trash2 aria-hidden="true" size={16} />
            </button>
          </div>
          <div className="round-fields">
            <label>
              <span>
                <Thermometer aria-hidden="true" size={15} />
                오븐 온도
              </span>
              <div>
                <input
                  type="number"
                  min="0"
                  max="500"
                  step="any"
                  inputMode="decimal"
                  aria-label={`${index + 1}차 굽기 온도`}
                  value={round.temperature}
                  placeholder="170"
                  onChange={(event) => {
                    if (validBakingNumber(event.target.value, 500))
                      updateRound(round.id, { temperature: event.target.value })
                    else onError('오븐 온도는 0~500°C 사이로 입력해 주세요.')
                  }}
                />
                <span>°C</span>
              </div>
            </label>
            <label>
              <span>
                <Timer aria-hidden="true" size={15} />
                굽는 시간
              </span>
              <div>
                <input
                  type="number"
                  min="0"
                  max="1440"
                  step="any"
                  inputMode="decimal"
                  aria-label={`${index + 1}차 굽기 시간`}
                  value={round.minutes}
                  placeholder="20"
                  onChange={(event) => {
                    if (validBakingNumber(event.target.value, 1440))
                      updateRound(round.id, { minutes: event.target.value })
                    else onError('굽는 시간은 0~1,440분 사이로 입력해 주세요.')
                  }}
                />
                <span>분</span>
              </div>
            </label>
          </div>
          <input
            className="round-note"
            aria-label={`${index + 1}차 굽기 메모`}
            maxLength={1000}
            value={round.note}
            placeholder="예: 온도를 낮추고, 틀을 한 번 돌려 주기"
            onChange={(event) => updateRound(round.id, { note: event.target.value })}
          />
        </div>
      ))}
      <button
        className="button add-round-button"
        disabled={baking.rounds.length >= 30}
        onClick={() => onChange({ rounds: [...baking.rounds, newBakingRound()] })}
      >
        <Plus aria-hidden="true" size={18} />
        굽기 칸 추가
      </button>
    </section>
  )
}
