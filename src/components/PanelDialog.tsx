import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'

export default function PanelDialog({
  title,
  children,
  onClose,
}: {
  title: string
  children: ReactNode
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    ref.current?.showModal()
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className="panel-dialog"
      aria-label={title}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="panel-content">
        <header>
          <div>
            <span className="eyebrow">A LITTLE PREPARATION</span>
            <h2>{title}</h2>
          </div>
          <button autoFocus className="icon-button" aria-label={`${title} 닫기`} onClick={onClose}>
            <X aria-hidden="true" size={22} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  )
}
