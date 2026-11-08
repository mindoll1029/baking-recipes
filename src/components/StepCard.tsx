import { Wheat } from 'lucide-react'
import type { Step } from '../model'

export default function StepCard({ step, index, onOpen, onTips }: {
  step: Step
  index: number
  onOpen: () => void
  onTips: () => void
}) {
  return (
    <article className={`step-card tone-${index % 3}`} data-step-id={step.id}
      aria-label={`${index + 1}단계 카드`}>
      <div className="step-card-top">
        <span className="step-number">{String(index + 1).padStart(2, '0')}</span>
      </div>
      <button className="step-open" aria-label={`${index + 1}단계 열기`} onClick={onOpen}>
        <div className="step-preview-body">
          <div>
            <h3>{step.title || '새로운 준비 단계'}</h3>
            <p>{step.instructions || '카드를 눌러 만드는 방법과 재료를 적어 주세요.'}</p>
          </div>
          {step.photo && <img src={step.photo} alt="" />}
        </div>
        <div className="ingredient-chips">
          <Wheat aria-hidden="true" size={14} />
          {step.ingredients.filter((item) => item.name.trim()).slice(0, 5).map((item) => (
            <span key={item.id}>{item.name}{item.quantity ? ` ${item.quantity}${item.unit}` : ''}</span>
          ))}
          {step.ingredients.filter((item) => item.name.trim()).length > 5 && (
            <span>+{step.ingredients.filter((item) => item.name.trim()).length - 5}</span>
          )}
          {!step.ingredients.some((item) => item.name.trim()) && <span>재료</span>}
        </div>
      </button>
      <button className="step-card-actions" aria-label={`${index + 1}단계 팁 편집`}
        aria-describedby={`step-tips-${step.id}`} onClick={onTips}>
        <span className="card-tips-label">팁</span>
        <span className="card-tips-text" id={`step-tips-${step.id}`}>
          {step.tips || '아직 작성한 팁이 없어요.'}
        </span>
      </button>
    </article>
  )
}
