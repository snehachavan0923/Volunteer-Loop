import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import ErrorMessage from './ErrorMessage'
import { fromInputValue, toInputValue } from '../utils/format'

// Create / edit form for a duty. Start and end times are optional.
export default function DutyForm({
  initial,
  minCapacity = 1,
  submitLabel = 'Save duty',
  busy = false,
  error = '',
  onSubmit,
  onCancel,
}) {
  const [values, setValues] = useState({
    title: initial?.title || '',
    description: initial?.description || '',
    capacity: initial?.capacity ?? '',
    start_time: toInputValue(initial?.start_time),
    end_time: toInputValue(initial?.end_time),
  })
  const [errors, setErrors] = useState({})

  const set = (field) => (e) => setValues((v) => ({ ...v, [field]: e.target.value }))

  function validate() {
    const next = {}
    if (!values.title.trim()) next.title = 'Title is required.'
    if (!values.description.trim()) next.description = 'Description is required.'
    const capacity = Number(values.capacity)
    if (!Number.isInteger(capacity) || capacity < 1) {
      next.capacity = 'Volunteers needed must be a whole number of at least 1.'
    } else if (capacity < minCapacity) {
      next.capacity = `Cannot be lower than the ${minCapacity} active registration(s).`
    }
    const start = fromInputValue(values.start_time)
    const end = fromInputValue(values.end_time)
    if (values.start_time && !start) next.start_time = 'Choose a valid start time.'
    if (values.end_time && !end) next.end_time = 'Choose a valid end time.'
    if (start && end && new Date(end) <= new Date(start)) next.end_time = 'End time must be after the start time.'
    return next
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (busy) return
    const next = validate()
    setErrors(next)
    if (Object.keys(next).length > 0) return
    onSubmit({
      title: values.title.trim(),
      description: values.description.trim(),
      capacity: Number(values.capacity),
      start_time: fromInputValue(values.start_time),
      end_time: fromInputValue(values.end_time),
    })
  }

  const cls = (name) => `input ${errors[name] ? 'input-error' : ''}`
  const err = (name) => errors[name] && <p className="mt-1 text-xs text-red-600">{errors[name]}</p>

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <ErrorMessage message={error} />
      <div>
        <label htmlFor="duty-title" className="label">Duty title</label>
        <input id="duty-title" className={cls('title')} value={values.title} onChange={set('title')} maxLength={200} />
        {err('title')}
      </div>
      <div>
        <label htmlFor="duty-description" className="label">Description</label>
        <textarea id="duty-description" rows={3} className={cls('description')} value={values.description} onChange={set('description')} maxLength={5000} />
        {err('description')}
      </div>
      <div>
        <label htmlFor="duty-capacity" className="label">
          Volunteers needed{minCapacity > 1 ? ` (minimum ${minCapacity})` : ''}
        </label>
        <input id="duty-capacity" type="number" min={Math.max(1, minCapacity)} step="1" className={cls('capacity')} value={values.capacity} onChange={set('capacity')} />
        {err('capacity')}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="duty-start" className="label">Start time (optional)</label>
          <input id="duty-start" type="datetime-local" className={cls('start_time')} value={values.start_time} onChange={set('start_time')} />
          {err('start_time')}
        </div>
        <div>
          <label htmlFor="duty-end" className="label">End time (optional)</label>
          <input id="duty-end" type="datetime-local" className={cls('end_time')} value={values.end_time} onChange={set('end_time')} />
          {err('end_time')}
        </div>
      </div>
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {submitLabel}
        </button>
      </div>
    </form>
  )
}
