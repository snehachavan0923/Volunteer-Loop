import { useState } from 'react'
import { Loader2 } from 'lucide-react'

// Legacy form retained for component tests; production registration uses Auth0 identity.
export default function RegistrationForm({
  initial,
  submitLabel = 'Register',
  busy = false,
  onSubmit,
  idPrefix = 'reg',
}) {
  const [studentId, setStudentId] = useState(initial?.studentId || '')
  const [studentName, setStudentName] = useState(initial?.studentName || '')
  const [errors, setErrors] = useState({})

  function handleSubmit(e) {
    e.preventDefault()
    if (busy) return
    const next = {}
    if (!studentId.trim()) next.studentId = 'Enter your student ID.'
    if (!studentName.trim()) next.studentName = 'Enter your name.'
    setErrors(next)
    if (Object.keys(next).length === 0) {
      onSubmit({ studentId: studentId.trim(), studentName: studentName.trim() })
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${idPrefix}-id`} className="label">
            Student ID
          </label>
          <input
            id={`${idPrefix}-id`}
            className={`input ${errors.studentId ? 'input-error' : ''}`}
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            placeholder="STU001"
            maxLength={50}
            aria-invalid={Boolean(errors.studentId)}
            aria-describedby={errors.studentId ? `${idPrefix}-id-err` : undefined}
          />
          {errors.studentId && (
            <p id={`${idPrefix}-id-err`} className="mt-1 text-xs text-red-600">
              {errors.studentId}
            </p>
          )}
        </div>
        <div>
          <label htmlFor={`${idPrefix}-name`} className="label">
            Your name
          </label>
          <input
            id={`${idPrefix}-name`}
            className={`input ${errors.studentName ? 'input-error' : ''}`}
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            placeholder="Rahul"
            maxLength={100}
            aria-invalid={Boolean(errors.studentName)}
            aria-describedby={errors.studentName ? `${idPrefix}-name-err` : undefined}
          />
          {errors.studentName && (
            <p id={`${idPrefix}-name-err`} className="mt-1 text-xs text-red-600">
              {errors.studentName}
            </p>
          )}
        </div>
      </div>
      <button type="submit" className="btn-primary w-full sm:w-auto" disabled={busy}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {submitLabel}
      </button>
    </form>
  )
}
