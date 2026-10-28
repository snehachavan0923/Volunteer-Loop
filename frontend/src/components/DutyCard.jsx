import { Clock, Loader2, Lock } from 'lucide-react'
import CapacityBar from './CapacityBar'
import { formatTimeRange } from '../utils/format'

// state: 'registered' | 'available' | 'full' | 'locked'
//   locked = the student has not joined the event yet (see lockedReason).
export default function DutyCard({
  duty,
  state,
  busy = false,
  lockedReason = '',
  onRegister,
  onCancel,
}) {
  const time = formatTimeRange(duty.start_time, duty.end_time)
  return (
    <div
      className={`rounded-xl border p-4 ${state === 'registered' ? 'border-emerald-300 bg-emerald-50/60' : 'border-stone-200 bg-white'}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="font-bold text-stone-900">{duty.title}</h4>
        {state === 'registered' && (
          <span className="badge bg-emerald-700 text-white">You're signed up</span>
        )}
        {state === 'full' && <span className="badge bg-red-50 text-red-700">Full</span>}
      </div>
      <p className="mt-1 text-sm text-stone-600">{duty.description}</p>
      {time && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-stone-500">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {time}
        </p>
      )}
      <div className="mt-3">
        <CapacityBar used={duty.registered_count} total={duty.capacity} label="openings" />
      </div>

      <div className="mt-4">
        {state === 'registered' && (
          <button type="button" className="btn-secondary btn-sm" onClick={onCancel} disabled={busy}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            Cancel this duty
          </button>
        )}
        {state === 'available' && (
          <button type="button" className="btn-primary btn-sm" onClick={onRegister} disabled={busy}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            Sign up for this duty
          </button>
        )}
        {state === 'full' && (
          <button type="button" className="btn-secondary btn-sm" disabled>
            No openings left
          </button>
        )}
        {state === 'locked' && (
          <p className="flex items-center gap-1.5 text-xs font-medium text-stone-500">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" /> {lockedReason}
          </p>
        )}
      </div>
    </div>
  )
}
