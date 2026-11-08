import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import PiggyScene, { ENTRANCE_IMAGES } from './PiggyScene'
import { PIGGY_DURATION } from './piggy-motion'
import './oven-entrance.css'

const SEEN_KEY = 'oven-note:entrance-seen'
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

function shouldShowEntrance() {
  if (window.matchMedia(REDUCED_MOTION).matches) return false
  if (new URLSearchParams(window.location.search).get('intro') === '1') return true
  try {
    return sessionStorage.getItem(SEEN_KEY) !== '1'
  } catch {
    return true
  }
}

export default function OvenEntrance({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(shouldShowEntrance)
  const [ready, setReady] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const skip = useRef<HTMLButtonElement>(null)
  const complete = useCallback(() => {
    try {
      sessionStorage.setItem(SEEN_KEY, '1')
    } catch {
      // Private/embedded browsers can disable storage. Entry still works.
    }
    try {
      const url = new URL(window.location.href)
      if (url.searchParams.get('intro') === '1') {
        url.searchParams.delete('intro')
        window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
      }
    } catch {
      // A restricted history API must not block entry after an explicit replay.
    }
    setVisible(false)
  }, [])

  useEffect(() => {
    if (!visible) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    container.current?.focus({ preventScroll: true })
    const preference = window.matchMedia(REDUCED_MOTION)
    const onPreference = () => { if (preference.matches) complete() }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        complete()
      } else if (event.key === 'Tab') {
        // There is exactly one interactive control in the modal.
        event.preventDefault()
        skip.current?.focus({ preventScroll: true })
      }
    }
    preference.addEventListener('change', onPreference)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      preference.removeEventListener('change', onPreference)
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = originalOverflow
      document.getElementById('main-content')?.focus({ preventScroll: true })
    }
  }, [visible, complete])

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    const images = ENTRANCE_IMAGES.map(src => {
      const image = new Image()
      image.src = src
      return image
    })
    // Never leave the recipe page behind a stalled or broken image request.
    const timeout = window.setTimeout(complete, 2400)
    Promise.all(images.map(image => image.decode())).then(() => {
      if (!cancelled) {
        window.clearTimeout(timeout)
        setReady(true)
      }
    }).catch(() => { if (!cancelled) complete() })
    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [visible, complete])

  useEffect(() => {
    if (!visible || !ready) return
    // Also release the page if CSS or animation events are unavailable.
    const timeout = window.setTimeout(complete, PIGGY_DURATION + 400)
    return () => window.clearTimeout(timeout)
  }, [visible, ready, complete])

  return (
    <>
      <div className="recipe-app" inert={visible} aria-hidden={visible || undefined}>
        {children}
      </div>
      {visible && (
        <div ref={container} className="oven-entrance" data-ready={ready}
          role="dialog" aria-modal="true" aria-label="오븐 노트 시작 화면"
          aria-describedby="entrance-description" tabIndex={-1}
          onAnimationEnd={event => {
            if (event.target === event.currentTarget && event.animationName === 'piggy-dismiss') complete()
          }}>
          <PiggyScene />
          <button ref={skip} className="entrance-skip" onClick={complete}>
            바로 들어가기 <span aria-hidden="true">↗</span>
          </button>
          <p id="entrance-description" className="visually-hidden">
            OFFICE Piggy 글자가 내려오고 돼지가 왼쪽 벽을 잡고 몸을 기울여 빼꼼 내다보면 레시피 노트로 이동합니다.
            바로 들어가기 버튼이나 Esc 키로 건너뛸 수 있어요.
          </p>
        </div>
      )}
    </>
  )
}
