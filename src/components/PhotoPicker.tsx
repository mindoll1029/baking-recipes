import { useRef, useState } from 'react'
import { Camera, ImagePlus, LoaderCircle, X } from 'lucide-react'
import { readPhoto } from '../storage'

interface Props {
  value: string | null
  label: string
  variant?: 'cover' | 'step'
  onChange: (value: string | null) => void
  onError: (message: string) => void
}

export default function PhotoPicker({ value, label, variant = 'step', onChange, onError }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  async function upload(file?: File) {
    if (!file || busy) return
    setBusy(true)
    try {
      onChange(await readPhoto(file))
    } catch (error) {
      onError(error instanceof Error ? error.message : '사진을 추가하지 못했어요.')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }
  return (
    <div
      className={`photo-picker photo-picker--${variant} ${value ? 'has-photo' : ''}`}
      aria-busy={busy}
    >
      <input
        ref={input}
        className="visually-hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label={label}
        tabIndex={-1}
        onChange={(event) => {
          void upload(event.target.files?.[0])
        }}
      />
      {value && (
        <img src={value} alt={variant === 'cover' ? '레시피 대표 사진' : '단계 과정 사진'} />
      )}
      <button
        type="button"
        className="photo-select"
        aria-label={`${label} ${value ? '변경' : '추가'}`}
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        {busy ? (
          <LoaderCircle aria-hidden="true" size={18} className="spin" />
        ) : value ? (
          <Camera aria-hidden="true" size={15} />
        ) : (
          <ImagePlus aria-hidden="true" size={variant === 'cover' ? 28 : 20} strokeWidth={1.5} />
        )}
        <span>
          {busy
            ? '사진 준비 중…'
            : value
              ? '사진 바꾸기'
              : variant === 'cover'
                ? '완성 사진을 담아 보세요'
                : '이 단계의 사진 추가'}
        </span>
        {!value && variant === 'cover' && <small>JPG, PNG, WebP · 최대 10MB</small>}
      </button>
      {value && (
        <button
          type="button"
          className="photo-remove"
          aria-label={`${label} 삭제`}
          onClick={() => onChange(null)}
        >
          <X aria-hidden="true" size={14} />
        </button>
      )}
    </div>
  )
}
