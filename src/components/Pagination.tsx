import { ArrowLeft, ArrowRight } from 'lucide-react'

export default function Pagination({
  page,
  pages,
  label,
  onChange,
}: {
  page: number
  pages: number
  label: string
  onChange: (page: number) => void
}) {
  if (pages <= 1) return null
  return (
    <nav className="pagination" aria-label={`${label} 페이지`}>
      <button
        className="button secondary"
        aria-label={`이전 ${label}`}
        disabled={page === 0}
        onClick={() => onChange(page - 1)}
      >
        <ArrowLeft aria-hidden="true" size={16} />
        <span>이전</span>
      </button>
      <span aria-live="polite">
        <b>{page + 1}</b> / {pages}
      </span>
      <button
        className="button secondary"
        aria-label={`다음 ${label}`}
        disabled={page >= pages - 1}
        onClick={() => onChange(page + 1)}
      >
        <span>다음</span>
        <ArrowRight aria-hidden="true" size={16} />
      </button>
    </nav>
  )
}
