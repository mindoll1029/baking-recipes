import { Plus, Wheat, X } from 'lucide-react'
import { newIngredient, validQuantity } from '../model'
import type { Ingredient } from '../model'

export default function IngredientFields({
  ingredients,
  label,
  onChange,
  onError,
}: {
  ingredients: Ingredient[]
  label: string
  onChange: (ingredients: Ingredient[]) => void
  onError: (message: string) => void
}) {
  function update(id: string, patch: Partial<Ingredient>) {
    onChange(ingredients.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }
  return (
    <section className="ingredient-fields" aria-label={`${label} 재료 목록`}>
      <div className="field-heading">
        <Wheat aria-hidden="true" size={19} />
        <h3>이 단계의 재료</h3>
        <span className="count-badge">{ingredients.length}</span>
      </div>
      {ingredients.length > 0 && (
        <div className="ingredient-column-labels">
          <span>재료 이름</span>
          <span>분량</span>
        </div>
      )}
      {ingredients.map((item, index) => (
        <div className="ingredient-input-row" key={item.id}>
          <input
            value={item.name}
            maxLength={100}
            aria-label={`${label} 재료 ${index + 1} 이름`}
            onChange={(event) => update(item.id, { name: event.target.value })}
          />
          <div className="ingredient-quantity">
            <input
              type="number"
              min="0"
              max="1000000"
              step="any"
              inputMode="decimal"
              value={item.quantity}
              style={{ width: item.quantity === '' ? '100%' : `${item.quantity.length}ch` }}
              placeholder={item.unit}
              title={`단위: ${item.unit}`}
              aria-describedby={item.quantity !== '' ? `ingredient-unit-${item.id}` : undefined}
              disabled={item.unit === '적당량'}
              aria-label={`${label} 재료 ${index + 1} 분량`}
              onChange={(event) => {
                if (validQuantity(event.target.value))
                  update(item.id, { quantity: event.target.value })
                else onError('분량은 0~1,000,000 사이로 입력해 주세요.')
              }}
            />
            {item.quantity !== '' && (
              <span className="ingredient-unit" id={`ingredient-unit-${item.id}`}
                aria-label={`${label} 재료 ${index + 1} 단위`}>
                {item.unit}
              </span>
            )}
          </div>
          <button
            className="icon-button danger"
            type="button"
            aria-label={`${label} 재료 ${index + 1} 삭제`}
            onClick={() => onChange(ingredients.filter((entry) => entry.id !== item.id))}
          >
            <X aria-hidden="true" size={16} />
          </button>
        </div>
      ))}
      {!ingredients.length && (
        <p className="ingredient-empty-hint">
          아직 적어 둔 재료가 없어요.
          <br />
          재료가 필요 없는 단계는 비워 두어도 좋아요.
        </p>
      )}
      <button
        type="button"
        className="button add-row-button"
        disabled={ingredients.length >= 100}
        onClick={() => onChange([...ingredients, newIngredient()])}
      >
        <Plus aria-hidden="true" size={16} />
        재료 추가
      </button>
    </section>
  )
}
