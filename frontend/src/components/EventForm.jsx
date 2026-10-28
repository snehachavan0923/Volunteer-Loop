import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import ErrorMessage from './ErrorMessage'
import { fromInputValue, toInputValue } from '../utils/format'

const SUGGESTED_CATEGORIES = ['Environment', 'Health', 'Education', 'Community', 'Cultural', 'Sports']

// Create / edit form for an event. `minCapacity` is the number of active
// registrations: the backend refuses a smaller capacity, and we say so up front.
export default function EventForm({
  initial,
  minCapacity = 1,
  submitLabel = 'Save event',
  busy = false,
  error = '',
  onSubmit,
  onCancel,
}) {
  const [values, setValues] = useState({
    title: initial?.title || '',
    description: initial?.description || '',
    location: initial?.location || '',
    event_date: toInputValue(initial?.event_date),
    registration_deadline: toInputValue(initial?.registration_deadline),
    capacity: initial?.capacity ?? '',
    organizer_name: initial?.organizer_name || '',
    category: initial?.category || '',
  })
  const [errors, setErrors] = useState({})

  const set = (field) => (e) => setValues((v) => ({ ...v, [field]: e.target.value }))

  function validate() {
    const next = {}
    if (!values.title.trim()) next.title = 'Title is required.'
    if (!values.description.trim()) next.description = 'Description is required.'
    if (!values.location.trim()) next.location = 'Location is required.'
    const eventDt = fromInputValue(values.event_date)
    if (!values.event_date || !eventDt) {
      next.event_date = 'Choose a valid date and time.'
    }
    const deadlineDt = fromInputValue(values.registration_deadline)
    if (values.registration_deadline && !deadlineDt) {
      next.registration_deadline = 'Choose a valid deadline date and time.'
    } else if (eventDt && deadlineDt && new Date(deadlineDt) > new Date(eventDt)) {
      next.registration_deadline = 'Registration deadline must be on or before the event date.'
    }

    const capacity = Number(values.capacity)
    if (!Number.isInteger(capacity) || capacity < 1) {
      next.capacity = 'Capacity must be a whole number of at least 1.'
    } else if (capacity < minCapacity) {
      next.capacity = `Capacity cannot be lower than the ${minCapacity} active registration(s).`
    }
    if (!values.organizer_name.trim()) next.organizer_name = 'Organizer name is required.'
    if (!values.category.trim()) next.category = 'Category is required.'
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
      location: values.location.trim(),
      event_date: fromInputValue(values.event_date),
      registration_deadline: values.registration_deadline ? fromInputValue(values.registration_deadline) : null,
      capacity: Number(values.capacity),
      organizer_name: values.organizer_name.trim(),
      category: values.category.trim(),
    })
  }

  const field = (name, label, input) => (
    <div>
      <label htmlFor={`event-${name}`} className="label">
        {label}
      </label>
      {input}
      {errors[name] && <p className="mt-1 text-xs text-red-600">{errors[name]}</p>}
    </div>
  )
  const cls = (name) => `input ${errors[name] ? 'input-error' : ''}`

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <ErrorMessage message={error} />
      {field(
        'title',
        'Title',
        <input id="event-title" className={cls('title')} value={values.title} onChange={set('title')} maxLength={200} />,
      )}
      {field(
        'description',
        'Description',
        <textarea id="event-description" rows={4} className={cls('description')} value={values.description} onChange={set('description')} maxLength={5000} />,
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {field(
          'location',
          'Location',
          <input id="event-location" className={cls('location')} value={values.location} onChange={set('location')} maxLength={200} />,
        )}
        {field(
          'event_date',
          'Date and time (your local time)',
          <input id="event-event_date" type="datetime-local" className={cls('event_date')} value={values.event_date} onChange={set('event_date')} />,
        )}
        {field(
          'registration_deadline',
          'Registration deadline (optional)',
          <input id="event-registration_deadline" type="datetime-local" className={cls('registration_deadline')} value={values.registration_deadline} onChange={set('registration_deadline')} />,
        )}
        {field(
          'capacity',
          minCapacity > 1 ? `Capacity (minimum ${minCapacity})` : 'Capacity',
          <input id="event-capacity" type="number" min={Math.max(1, minCapacity)} step="1" className={cls('capacity')} value={values.capacity} onChange={set('capacity')} />,
        )}
        {field(
          'category',
          'Category',
          <>
            <input id="event-category" list="event-categories" className={cls('category')} value={values.category} onChange={set('category')} maxLength={50} />
            <datalist id="event-categories">
              {SUGGESTED_CATEGORIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </>,
        )}
        {field(
          'organizer_name',
          'Organizer name',
          <input id="event-organizer_name" className={cls('organizer_name')} value={values.organizer_name} onChange={set('organizer_name')} maxLength={100} />,
        )}
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
