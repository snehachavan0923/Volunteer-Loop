import { useState } from 'react'
import { Check, CheckCircle2, Circle, Clock, UserRound } from 'lucide-react'
import { formatDateTime } from '../utils/format'

export default function ParticipantList({
  participants,
  showIds = true,
  emptyText = 'Nobody has registered yet.',
  onUpdateAttendance = null, // (participantId, { attended: boolean, hours_verified: number }) => Promise<void>
}) {
  const [editingId, setEditingId] = useState(null)
  const [hoursInput, setHoursInput] = useState('')
  const [savingId, setSavingId] = useState(null)

  if (!participants || participants.length === 0) {
    return <p className="text-sm text-stone-500">{emptyText}</p>
  }

  async function handleSave(p, attended, hours) {
    if (!onUpdateAttendance) return
    setSavingId(p.id)
    try {
      await onUpdateAttendance(p.id, {
        attended,
        hours_verified: Number(hours) || 0,
      })
      setEditingId(null)
    } finally {
      setSavingId(null)
    }
  }

  return (
    <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
      {participants.map((p) => {
        const isEditing = editingId === p.id
        const isSaving = savingId === p.id
        return (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-3 text-sm">
            <div className="flex items-center gap-3 min-w-0">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${p.attended ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-600'}`}>
                {p.attended ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <UserRound className="h-4 w-4" aria-hidden="true" />}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold text-stone-800">{p.student_name}</span>
                  {p.attended && (
                    <span className="badge bg-emerald-50 text-emerald-800 text-[10px]">
                      {p.hours_verified ? `${p.hours_verified} hrs verified` : 'Attended'}
                    </span>
                  )}
                </div>
                {showIds && <span className="block text-xs text-stone-500 truncate">{p.student_id}</span>}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="hidden text-xs text-stone-400 sm:block">
                {formatDateTime(p.created_at)}
              </span>

              {onUpdateAttendance && (
                isEditing ? (
                  <div className="flex items-center gap-1.5">
                    <label htmlFor={`hours-${p.id}`} className="sr-only">Hours</label>
                    <input
                      id={`hours-${p.id}`}
                      type="number"
                      step="0.5"
                      min="0"
                      max="100"
                      className="input w-20 py-1 text-xs"
                      placeholder="Hours"
                      value={hoursInput}
                      onChange={(e) => setHoursInput(e.target.value)}
                    />
                    <button
                      type="button"
                      disabled={isSaving}
                      className="btn-primary btn-sm py-1 px-2 text-xs"
                      onClick={() => handleSave(p, true, hoursInput)}
                    >
                      {isSaving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      disabled={isSaving}
                      className="btn-secondary btn-sm py-1 px-2 text-xs"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={isSaving}
                      className={`btn-secondary btn-sm py-1 px-2.5 text-xs ${p.attended ? 'text-emerald-800' : 'text-stone-600'}`}
                      onClick={() => {
                        setHoursInput(String(p.hours_verified || 2))
                        setEditingId(p.id)
                      }}
                    >
                      <Clock className="h-3 w-3 mr-1 inline" />
                      {p.attended ? 'Edit hours' : 'Verify attendance'}
                    </button>
                    {p.attended && (
                      <button
                        type="button"
                        disabled={isSaving}
                        className="btn-ghost btn-sm py-1 px-2 text-xs text-stone-500 hover:text-red-700"
                        title="Mark as not attended"
                        onClick={() => handleSave(p, false, 0)}
                      >
                        Unmark
                      </button>
                    )}
                  </div>
                )
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
