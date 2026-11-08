import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

interface Props {
  title: string
  description: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}

export default function Dialog({
  title,
  description,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    ref.current?.showModal()
  }, [])
  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      aria-labelledby="dialog-title"
      aria-describedby="dialog-description"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="dialog-content">
        <button
          type="button"
          className="icon-button dialog-close"
          aria-label="닫기"
          onClick={onClose}
        >
          <X aria-hidden="true" size={18} />
        </button>
        <span className="eyebrow">OVEN NOTE</span>
        <h2 id="dialog-title">{title}</h2>
        <p id="dialog-description">{description}</p>
        <div className="dialog-actions">
          <button type="button" className="button secondary" autoFocus onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className={`button ${danger ? 'destructive' : 'primary'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  )
}
