// Small progress bar for seats / duty openings.
export default function CapacityBar({ used, total, label = 'seats' }) {
  const percent = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0
  const remaining = Math.max(total - used, 0)
  const color = remaining === 0 ? 'bg-red-500' : percent >= 80 ? 'bg-amber-500' : 'bg-emerald-600'
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-xs font-medium text-stone-600">
        <span>
          {used} / {total} filled
        </span>
        <span className={remaining === 0 ? 'text-red-600' : ''}>
          {remaining === 0 ? `No ${label} left` : `${remaining} ${label} left`}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-stone-200"
        role="progressbar"
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={`${used} of ${total} ${label} filled`}
      >
        <div className={`h-full rounded-full ${color}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
