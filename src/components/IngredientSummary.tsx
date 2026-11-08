import { useMemo, useState } from 'react'
import { Check, ShoppingBasket, Sparkles } from 'lucide-react'
import { formatAmount, totalIngredients } from '../model'
import type { Step } from '../model'

export default function IngredientSummary({
  steps,
  servings,
}: {
  steps: Step[]
  servings: string
}) {
  const [multiplier, setMultiplier] = useState(1)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const totals = useMemo(() => totalIngredients(steps, multiplier), [steps, multiplier])
  const checkedCount = totals.filter((item) => checked.has(item.key)).length
  return (
    <aside className="ingredients-panel" aria-label="전체 재료">
      <div className="ingredients-panel-heading">
        <span className="basket-icon">
          <ShoppingBasket aria-hidden="true" size={21} strokeWidth={1.7} />
        </span>
        <div>
          <h3>한눈에 보는 재료</h3>
          <p>각 단계와 굽기에 입력한 재료를 자동 합산해요</p>
        </div>
      </div>
      <div className="portion-row">
        <span>{servings ? `${servings} 기준` : '기본 레시피 기준'}</span>
        <label>
          <span className="visually-hidden">재료 배율</span>
          <select
            aria-label="재료 배율"
            value={multiplier}
            onChange={(event) => {
              setMultiplier(Number(event.target.value))
              setChecked(new Set())
            }}
          >
            {[0.5, 1, 1.5, 2, 3].map((value) => (
              <option key={value} value={value}>
                × {value}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="total-list">
        {totals.length === 0 && (
          <div className="ingredients-empty">
            <WheatIllustration />
            <p>첫 재료를 적어 볼까요?</p>
            <span>
              단계에 재료를 추가하면
              <br />
              필요한 양을 여기에 모아 드려요.
            </span>
          </div>
        )}
        {totals.map((item) => (
          <label
            className={`total-ingredient ${checked.has(item.key) ? 'is-checked' : ''}`}
            key={item.key}
          >
            <input
              type="checkbox"
              checked={checked.has(item.key)}
              onChange={(event) => {
                const next = new Set(checked)
                if (event.target.checked) next.add(item.key)
                else next.delete(item.key)
                setChecked(next)
              }}
            />
            <span className="custom-checkbox">
              <Check aria-hidden="true" size={11} strokeWidth={2.8} />
            </span>
            <span className="total-name">{item.name}</span>
            <span className="total-quantity" data-testid="total-quantity">
              {item.unit === '적당량' ? (
                '적당량'
              ) : (
                <>
                  {item.hasQuantity ? (
                    <>
                      {formatAmount(item.quantity)}
                      <small>{item.unit}</small>
                    </>
                  ) : (
                    '분량 미정'
                  )}
                  {item.hasQuantity && item.unspecified && (
                    <small className="unspecified">+ 분량 미정</small>
                  )}
                </>
              )}
            </span>
          </label>
        ))}
      </div>
      {totals.length > 0 && (
        <div className="ingredients-progress">
          <span>
            {checkedCount === totals.length
              ? '준비 완료! 이제 구워 볼까요?'
              : `${totals.length}가지 중 ${checkedCount}가지 준비했어요`}
          </span>
          {checkedCount > 0 && (
            <button type="button" onClick={() => setChecked(new Set())}>
              초기화
            </button>
          )}
          <div className="progress-track">
            <span style={{ width: `${(checkedCount / totals.length) * 100}%` }} />
          </div>
        </div>
      )}
      <div className="ingredients-tip">
        <Sparkles aria-hidden="true" size={15} />
        <p>
          재료 추가·수정은 각 카드에서 해 주세요. 같은 재료는 자동으로 더해져요.
          <br />
          <span>g·kg, ml·L 단위도 함께 계산해요.</span>
        </p>
      </div>
    </aside>
  )
}

function WheatIllustration() {
  return (
    <svg width="36" height="44" viewBox="0 0 36 44" fill="none" aria-hidden="true">
      <path
        d="M18 41V12m0 20C4 30 5 20 5 20s13 2 13 12Zm0-9C7 21 7 12 7 12s11 1 11 11Zm0 9c14-2 13-12 13-12s-13 2-13 12Zm0-9c11-2 11-11 11-11s-11 1-11 11Zm0-7c-8-8 0-14 0-14s8 6 0 14Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}
