// The API sends UTC timestamps ending in "Z". These helpers show them in the
// viewer's local time and convert form values back to UTC for the API.

export function formatDateTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString(undefined, { timeStyle: 'short' })
}

export function formatTimeRange(start, end) {
  if (start && end) return `${formatTime(start)} – ${formatTime(end)}`
  if (start) return `from ${formatTime(start)}`
  if (end) return `until ${formatTime(end)}`
  return ''
}

const pad = (n) => String(n).padStart(2, '0')

// ISO string -> value for <input type="datetime-local"> (local time).
export function toInputValue(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// <input type="datetime-local"> value (local time) -> UTC ISO string, or null.
export function fromInputValue(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function isPast(iso) {
  return new Date(iso).getTime() < Date.now()
}
