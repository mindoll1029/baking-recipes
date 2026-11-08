import type { Recipe } from '../model'
import { validBakingNumber } from '../model'
import PhotoPicker from './PhotoPicker'

export default function RecipeDetails({ recipe, onChange, onError, error }: {
  recipe: Recipe
  onChange: (patch: Partial<Recipe>) => void
  onError: (message: string) => void
  error: string
}) {
  return (
    <div className="recipe-details-form">
      {error && <p role="alert" className="details-error">{error}</p>}
      <label>
        레시피 이름
        <input id="recipe-title" autoFocus aria-label="레시피 이름" maxLength={120}
          value={recipe.title} placeholder="레시피 이름을 적어 주세요"
          onChange={(event) => onChange({ title: event.target.value })} />
      </label>
      <label>
        레시피 소개
        <textarea aria-label="레시피 소개" maxLength={2000} rows={3}
          value={recipe.description} onChange={(event) => onChange({ description: event.target.value })} />
      </label>
      <div className="details-metadata">
        <label>
          완성 분량
          <input aria-label="완성 분량" maxLength={40} value={recipe.servings}
            placeholder="예: 8조각" onChange={(event) => onChange({ servings: event.target.value })} />
        </label>
        <label>
          전체 소요 시간 (분)
          <input type="number" aria-label="전체 소요 시간" min="0" max="10080" step="any"
            inputMode="decimal" value={recipe.minutes} placeholder="예: 55"
            onChange={(event) => {
              if (validBakingNumber(event.target.value, 10080)) onChange({ minutes: event.target.value })
            }} />
        </label>
      </div>
      <div className="details-cover">
        <span>대표 사진</span>
        <PhotoPicker variant="cover" label="대표 사진"
          value={recipe.cover || (recipe.coverPreset ? `${import.meta.env.BASE_URL}lemon-cake.svg` : null)}
          onChange={(cover) => onChange({ cover, coverPreset: null })} onError={onError} />
      </div>
      <label>
        베이킹 메모
        <textarea aria-label="베이킹 메모 내용" rows={3} maxLength={10000}
          value={recipe.notes} onChange={(event) => onChange({ notes: event.target.value })} />
      </label>
      <p className="field-help">입력한 내용은 자동 저장돼요.</p>
    </div>
  )
}
