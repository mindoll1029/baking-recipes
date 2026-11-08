import { BookOpen, Clock3, Heart, Plus, Search, Wheat } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Recipe } from '../model'
import { readPhoto } from '../storage'
import Pagination from './Pagination'
import piggyBody from '../assets/piggy-revised/piggy-body.png'
import piggyHand from '../assets/piggy-revised/piggy-hands.png'

const exampleCover = `${import.meta.env.BASE_URL}lemon-cake.svg`
const nameOf = (recipe: Recipe) => recipe.title.trim() || '이름 없는 레시피'

export default function HomePage({
  recipes,
  onOpen,
  onCreate,
  onFavorite,
  onCoverChange,
  onError,
  saveState,
}: {
  recipes: Recipe[]
  onOpen: (id: string) => void
  onCreate: () => void
  onFavorite: (id: string) => void
  onCoverChange: (id: string, cover: string) => void
  onError: (message: string) => void
  saveState: 'loading' | 'saving' | 'saved' | 'error'
}) {
  const [favoritePulse, setFavoritePulse] = useState<{id:string;sequence:number} | null>(null)
  useEffect(() => {
    if (!favoritePulse) return
    const timer = setTimeout(() => setFavoritePulse(null), 550)
    return () => clearTimeout(timer)
  }, [favoritePulse])
  function toggleFavorite(id: string) {
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      setFavoritePulse(current => ({id, sequence:(current?.sequence ?? 0) + 1}))
    onFavorite(id)
  }
  const [query, setQuery] = useState('')
  const [favorites, setFavorites] = useState(false)
  const [page, setPage] = useState(0)
  const coverInput = useRef<HTMLInputElement>(null)
  const coverTarget = useRef<string | null>(null)
  const [coverBusy, setCoverBusy] = useState<string | null>(null)
  async function uploadCover(file?: File) {
    const id = coverTarget.current
    if (!file || !id || coverBusy) return
    setCoverBusy(id)
    try {
      onCoverChange(id, await readPhoto(file))
    } catch (error) {
      onError(error instanceof Error ? error.message : '사진을 추가하지 못했어요.')
    } finally {
      setCoverBusy(null)
      if (coverInput.current) coverInput.current.value = ''
    }
  }
  const filtered = recipes.filter(
    (recipe) =>
      (!favorites || recipe.favorite) &&
      `${recipe.title} ${recipe.description}`
        .toLocaleLowerCase('ko-KR')
        .includes(query.trim().toLocaleLowerCase('ko-KR')),
  )
  const pages = Math.max(1, Math.ceil(filtered.length / 6))
  const currentPage = Math.min(page, pages - 1)
  return (
    <main id="main-content" className="home-page page-width" tabIndex={-1}>
      <input ref={coverInput} className="visually-hidden" type="file"
        aria-label="목록 대표 사진" tabIndex={-1} accept="image/jpeg,image/png,image/webp"
        onChange={(event) => { void uploadCover(event.target.files?.[0]) }} />
      <section className="home-hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <Wheat aria-hidden="true" size={16} />
            WELCOME TO PIGGY’S HOME
          </span>
          <h1>안녕하세요.</h1>
          <p>
            맛있는 레시피를 모아두었어요.
            <br />
            드셔보세요.
          </p>
          <button className="button primary" onClick={onCreate}>
            <Plus aria-hidden="true" size={18} />새 레시피 쓰기
          </button>
        </div>
        <div className="hero-illustration" aria-hidden="true">
          <span className="house-plaque">PIGGY’S KITCHEN</span>
          <div className="notebook-window">
            <svg viewBox="0 0 360 360" focusable="false">
              <defs>
                <clipPath id="notebook-window-opening"><rect x="100" width="260" height="360" /></clipPath>
              </defs>
              <rect width="360" height="360" fill="#914d55" />
              <g clipPath="url(#notebook-window-opening)">
                <svg x="100" y="20" width="240" height="300" viewBox="0 0 1122 1402" overflow="visible">
                  <g transform="translate(-755 0)"><g transform="rotate(16 740 1310)">
                    <image href={piggyBody} width="1122" height="1402" />
                  </g></g>
                </svg>
              </g>
              <svg width="100" height="360" viewBox="0 0 257 1086" preserveAspectRatio="xMaxYMid slice">
                <image href="/entrance/piggy-background.webp" width="1448" height="1086" />
              </svg>
              <svg x="100" y="20" width="240" height="300" viewBox="0 0 1122 1402" overflow="visible">
                <g transform="translate(-31 935) rotate(-90)">
                  <svg x="-65" y="-40.625" width="130" height="81.25" viewBox="180 430 440 275">
                    <image href={piggyHand} width="1536" height="1024" />
                  </svg>
                </g>
              </svg>
            </svg>
            <span className="notebook-window-label">HOME, SWEET HOME.</span>
          </div>
          <svg className="house-pantry" viewBox="0 0 220 270" fill="none" focusable="false">
            <g stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 88h204v9H8zM8 186h204v9H8zM8 253h204v9H8z" fill="#f6e9d2" />
              <path d="M22 97v12m176-12v12M22 195v12m176-12v12" />
              <rect x="22" y="30" width="46" height="57" rx="8" fill="#b16c68" />
              <rect x="19" y="22" width="52" height="9" rx="3" fill="#f6e9d2" />
              <rect x="32" y="47" width="26" height="22" rx="4" fill="#f6e9d2" stroke="none" />
              <path d="M41 53v10m-4-8 4 3 4-3m-8 4 4 3 4-3" stroke="#874047" strokeWidth="1.5" />
              <rect x="86" y="42" width="46" height="45" rx="8" fill="#b16c68" />
              <rect x="83" y="34" width="52" height="9" rx="3" fill="#f6e9d2" />
              <rect x="96" y="55" width="26" height="19" rx="4" fill="#f6e9d2" stroke="none" />
              <path d="m109 60 5 5-5 5-5-5z" stroke="#874047" strokeWidth="1.5" />
              <path d="M158 87V38h34v49M156 38h38v-8h-38z" fill="#b16c68" />
              <path d="M163 51h24m-24 7h24m-24 7h24" opacity=".55" />
              <path d="M29 146h45v23a14 14 0 0 1-14 14H43a14 14 0 0 1-14-14zm45 4h6c16 0 15 24-6 24" fill="#f2d991" />
              <path d="M112 146h45v23a14 14 0 0 1-14 14h-17a14 14 0 0 1-14-14zm45 4h6c16 0 15 24-6 24" fill="#f6e9d2" />
              <path d="M25 185h60m24 0h60M42 133c-6-8 6-9 0-17m83 17c-6-8 6-9 0-17" />
              <rect x="25" y="218" width="15" height="34" rx="2" fill="#f2d991" />
              <rect x="44" y="211" width="19" height="41" rx="2" fill="#b16c68" />
              <rect x="67" y="220" width="16" height="32" rx="2" fill="#f6e9d2" />
              <path d="M49 219h9m-9 23h9" />
              <path d="M114 245h80v7h-80zm6-8h68v8h-68zm6-8h56v8h-56z" fill="#b16c68" />
            </g>
          </svg>
          <span className="house-counter" />
          <span className="hero-caption">조금씩, 정성스럽게</span>
        </div>
      </section>
      <section className="recipe-library" aria-labelledby="library-title">
        <div className="library-heading">
          <div>
            <span className="eyebrow">THE RECIPE SHELF</span>
            <h2 id="library-title">
              나의 레시피 노트 <span>{recipes.length}</span>
            </h2>
          </div>
          <label className="search-field">
            <Search aria-hidden="true" size={18} />
            <input
              aria-label="레시피 검색"
              type="search"
              value={query}
              placeholder="어떤 레시피를 찾으세요?"
              onChange={(event) => {
                setQuery(event.target.value)
                setPage(0)
              }}
            />
          </label>
        </div>
        <div className="library-toolbar">
          <button type="button" className="library-filter" role="switch" aria-label="즐겨찾기만 보기"
            aria-checked={favorites} onClick={() => { setFavorites(value => !value); setPage(0) }}>
            <span className="filter-selection" aria-hidden="true" />
            <span className={`filter-label ${!favorites ? 'active' : ''}`}><BookOpen aria-hidden="true" size={16} />전체 레시피</span>
            <span className={`filter-label ${favorites ? 'active' : ''}`}><Heart aria-hidden="true" size={16} />즐겨찾기</span>
          </button>
          <span className="library-count">{filtered.length}개의 맛있는 기록</span>
        </div>
        <div className="recipe-grid">
          {filtered.slice(currentPage * 6, (currentPage + 1) * 6).map((recipe) => (
            <article className="recipe-tile" key={recipe.id}>
              <button
                className={`tile-favorite icon-button ${recipe.favorite ? 'is-favorite' : ''} ${favoritePulse?.id === recipe.id ? 'is-animating' : ''}`}
                aria-label={`${nameOf(recipe)} 즐겨찾기 ${recipe.favorite ? '해제' : '추가'}`}
                aria-pressed={recipe.favorite}
                onClick={() => toggleFavorite(recipe.id)}
              >
                <Heart
                  key={favoritePulse?.id === recipe.id ? favoritePulse.sequence : 0}
                  aria-hidden="true"
                  size={18}
                  fill={recipe.favorite ? 'currentColor' : 'none'}
                />
              </button>
              <button
                className="recipe-tile-open"
                aria-label={`${nameOf(recipe)} 열기`}
                onClick={() => onOpen(recipe.id)}
              >
                <div className="recipe-tile-cover">
                  {recipe.cover || recipe.coverPreset ? (
                    <img src={recipe.cover || exampleCover} alt="" loading="lazy" />
                  ) : (
                    <div className="recipe-cover-placeholder">
                      <Wheat aria-hidden="true" size={40} strokeWidth={1.3} />
                      <span>BAKED WITH LOVE</span>
                    </div>
                  )}
                </div>
                <div className="recipe-tile-copy">
                  <h3>{nameOf(recipe)}</h3>
                  <p>{recipe.description || '나만의 베이킹 이야기를 적어 보세요.'}</p>
                  <div className="recipe-tile-meta">
                    <span>완성 분량 {recipe.servings || '미입력'}</span>
                    <span>
                      <Clock3 aria-hidden="true" size={14} />
                      전체 소요 시간 {recipe.minutes ? `${recipe.minutes}분` : '미입력'}
                    </span>
                  </div>
                </div>
              </button>
              <button className="recipe-cover-edit" aria-label={`${nameOf(recipe)} 이미지 수정`}
                aria-busy={coverBusy === recipe.id} disabled={coverBusy !== null}
                onClick={() => { coverTarget.current = recipe.id; coverInput.current?.click() }}>
                {coverBusy === recipe.id ? '사진 준비 중…' : '이미지 수정'}
              </button>
            </article>
          ))}
          {!query && !favorites && (
            <button className="new-recipe-tile" aria-label="새 레시피 만들기" onClick={onCreate}>
              <span>
                <Plus aria-hidden="true" size={26} />
              </span>
              <strong>새로운 맛을 기록해 볼까요?</strong>
              <p>나만의 다음 레시피를 기다리고 있어요.</p>
            </button>
          )}
        </div>
        {!filtered.length && (query || favorites) && (
          <div className="empty-results">
            <Search aria-hidden="true" size={28} />
            <h3>{query ? '찾는 레시피가 없어요' : '아직 즐겨찾는 레시피가 없어요'}</h3>
            <p>
              {query
                ? '다른 이름으로 검색해 보세요.'
                : '레시피의 하트를 눌러 자주 굽는 맛을 모아 보세요.'}
            </p>
            <button
              className="button secondary"
              onClick={() => {
                setQuery('')
                setFavorites(false)
                setPage(0)
              }}
            >
              전체 레시피 보기
            </button>
          </div>
        )}
        <Pagination page={currentPage} pages={pages} label="레시피 목록" onChange={setPage} />
      </section>
      <footer className="page-footer">
        <span>당신을 위해 준비했어요.</span>
        <span className="home-save">
          <span role="status" data-save-state={saveState}>
            {saveState === 'saved'
              ? ''
              : saveState === 'error'
                ? '저장 상태를 확인해 주세요'
                : '저장하는 중…'}
          </span>{' '}
          사랑하는 감쟈를 위해
        </span>
      </footer>
    </main>
  )
}
