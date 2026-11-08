import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { ArrowDown, ArrowUp, GripVertical, Trash2 } from 'lucide-react'
import type { Step } from '../model'

type Drag = {
  id: string
  pointerId: number
  y: number
  offset: number
  left: number
  width: number
  order: string[]
}

export default function StepOrder({ steps, onMove, onReorder, onDelete }: {
  steps: Step[]
  onMove: (id: string, direction: -1 | 1) => void
  onReorder: (id: string, index: number) => void
  onDelete: (step: Step, index: number) => void
}) {
  const list = useRef<HTMLOListElement>(null)
  const rows = useRef(new Map<string, HTMLLIElement>())
  const before = useRef(new Map<string, number>())
  const ghost = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const frame = useRef<number | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [preview, setPreview] = useState<string[] | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const helpId = useId()
  const ordered = preview
    ? preview.map((id) => steps.find((step) => step.id === id)).filter((step): step is Step => !!step)
    : steps
  const orderKey = ordered.map((step) => step.id).join(',')

  function rememberPositions() {
    before.current = new Map([...rows.current].map(([id, row]) => [id, row.getBoundingClientRect().top]))
  }

  // FLIP: animate the distance between each row's old visual position and its new slot.
  useLayoutEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    for (const [id, row] of rows.current) {
      const previous = before.current.get(id)
      row.getAnimations().forEach((animation) => animation.cancel())
      if (previous === undefined || reduced) continue
      const delta = previous - row.getBoundingClientRect().top
      if (Math.abs(delta) > 1) {
        row.animate(
          [{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }],
          { duration: 230, easing: 'cubic-bezier(.2,.8,.2,1)' },
        )
      }
    }
    before.current.clear()
  }, [orderKey, dragId])

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    drag.current = null
  }, [])

  function updatePosition() {
    const active = drag.current
    if (!active || !list.current) return
    if (ghost.current) ghost.current.style.top = `${active.y - active.offset}px`
    const others = active.order.filter((id) => id !== active.id)
    const listTop = list.current.getBoundingClientRect().top
    // Layout offsets exclude the animation transform, so a moving row cannot cause jitter.
    const target = others.filter((id) => {
      const row = rows.current.get(id)
      return row && active.y > listTop + row.offsetTop + row.offsetHeight / 2
    }).length
    const next = [...others]
    next.splice(target, 0, active.id)
    if (next.join(',') !== active.order.join(',')) {
      rememberPositions()
      active.order = next
      setPreview(next)
      setAnnouncement(`${target + 1}번째 위치. 놓으면 순서가 저장돼요.`)
    }
  }

  function scrollWhileDragging() {
    const active = drag.current
    const dialog = list.current?.closest('dialog')
    if (!active || !dialog) return
    const bounds = dialog.getBoundingClientRect()
    const edge = 52
    const speed = active.y < bounds.top + edge
      ? -Math.min(12, (bounds.top + edge - active.y) / 4)
      : active.y > bounds.bottom - edge
        ? Math.min(12, (active.y - bounds.bottom + edge) / 4)
        : 0
    if (speed) {
      dialog.scrollTop += speed
      updatePosition()
    }
    frame.current = requestAnimationFrame(scrollWhileDragging)
  }

  function startDrag(event: ReactPointerEvent<HTMLButtonElement>, step: Step) {
    if (event.button !== 0 || !event.isPrimary || steps.length < 2 || drag.current) return
    const row = rows.current.get(step.id)
    if (!row || !list.current) return
    event.preventDefault()
    event.currentTarget.focus({ preventScroll: true })
    const bounds = row.getBoundingClientRect()
    drag.current = {
      id: step.id, pointerId: event.pointerId, y: event.clientY,
      offset: event.clientY - bounds.top, left: bounds.left, width: bounds.width,
      order: steps.map((item) => item.id),
    }
    // Capture on the stable list, not a row that will move in the DOM.
    list.current.setPointerCapture(event.pointerId)
    setDragId(step.id)
    setPreview(drag.current.order)
    setAnnouncement(`${step.title || '단계'} 이동 중. Esc를 누르면 취소돼요.`)
    frame.current = requestAnimationFrame(scrollWhileDragging)
  }

  function finishDrag(commit: boolean) {
    const active = drag.current
    if (!active) return
    rememberPositions()
    if (ghost.current) before.current.set(active.id, ghost.current.getBoundingClientRect().top)
    drag.current = null
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
    if (list.current?.hasPointerCapture(active.pointerId)) {
      list.current.releasePointerCapture(active.pointerId)
    }
    const target = active.order.indexOf(active.id)
    if (commit) onReorder(active.id, target)
    setPreview(null)
    setDragId(null)
    setAnnouncement(commit ? `${target + 1}번째로 이동했어요.` : '이동을 취소했어요.')
    rows.current.get(active.id)?.querySelector<HTMLButtonElement>('.drag-handle')?.focus({ preventScroll: true })
  }

  function moveByButton(step: Step, index: number, direction: -1 | 1) {
    if (drag.current || index + direction < 0 || index + direction >= steps.length) return
    rememberPositions()
    onMove(step.id, direction)
    setAnnouncement(`${step.title || '단계'}: ${index + direction + 1}번째로 이동했어요.`)
  }

  const draggedStep = steps.find((step) => step.id === dragId)
  return (
    <div className="step-order" onKeyDownCapture={(event) => {
      if (event.key === 'Escape' && drag.current) {
        event.preventDefault()
        event.stopPropagation()
        finishDrag(false)
      }
    }}>
      <p id={helpId}>왼쪽 손잡이를 잡아 항목 사이로 옮기세요. 위아래 버튼이나 방향키로도 순서를 바꿀 수 있어요.</p>
      <ol ref={list} className="order-list"
        onPointerMove={(event) => {
          if (drag.current?.pointerId !== event.pointerId) return
          drag.current.y = event.clientY
          updatePosition()
        }}
        onPointerUp={(event) => {
          if (drag.current?.pointerId === event.pointerId) finishDrag(true)
        }}
        onPointerCancel={() => finishDrag(false)}
        onLostPointerCapture={() => finishDrag(false)}>
        {ordered.map((step, index) => (
          <li key={step.id} data-order-id={step.id} className={dragId === step.id ? 'is-dragging' : ''}
            ref={(node) => { if (node) rows.current.set(step.id, node); else rows.current.delete(step.id) }}>
            <button className="drag-handle" aria-label={`${index + 1}단계 순서 이동 손잡이`}
              aria-describedby={helpId} aria-pressed={dragId === step.id} disabled={steps.length === 1}
              onPointerDown={(event) => startDrag(event, step)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                  event.preventDefault()
                  moveByButton(step, index, event.key === 'ArrowUp' ? -1 : 1)
                }
              }}>
              <GripVertical aria-hidden="true" size={22} />
            </button>
            <span className="order-title" title={step.title || '이름 없는 단계'}>{index + 1}. {step.title || '이름 없는 단계'}</span>
            <div className="order-actions">
              <button className="icon-button" disabled={index === 0 || !!dragId}
                aria-label={`${index + 1}단계 앞으로 이동`} onClick={() => moveByButton(step, index, -1)}>
                <ArrowUp aria-hidden="true" size={18} />
              </button>
              <button className="icon-button" disabled={index === ordered.length - 1 || !!dragId}
                aria-label={`${index + 1}단계 뒤로 이동`} onClick={() => moveByButton(step, index, 1)}>
                <ArrowDown aria-hidden="true" size={18} />
              </button>
              <button className="icon-button danger" disabled={ordered.length === 1 || !!dragId}
                aria-label={`${index + 1}단계 삭제`} onClick={() => onDelete(step, index)}>
                <Trash2 aria-hidden="true" size={18} />
              </button>
            </div>
          </li>
        ))}
      </ol>
      {draggedStep && drag.current && (
        <div ref={ghost} className="order-drag-ghost" aria-hidden="true"
          style={{ left: drag.current.left, top: drag.current.y - drag.current.offset, width: drag.current.width }}>
          <GripVertical size={22} /><span>{draggedStep.title || '이름 없는 단계'}</span>
        </div>
      )}
      <span className="visually-hidden" role="status" aria-live="polite">{announcement}</span>
      <p className="field-help">내용·팁·사진·재료는 함께 이동하고, 바뀐 순서는 자동 저장돼요.</p>
    </div>
  )
}
