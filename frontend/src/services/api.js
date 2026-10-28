// The ONLY place that knows the backend address and endpoint paths.
// Components call these functions and never build URLs themselves.

export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'
).replace(/\/+$/, '')

let accessTokenGetter = null
export function setAccessTokenGetter(getter) { accessTokenGetter = getter }

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

// FastAPI sends {"detail": "text"} for business errors and
// {"detail": [{loc, msg}, ...]} for validation errors (422).
export function messageFromDetail(detail, fallback) {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail.length > 0) {
    return detail
      .map((item) => {
        const field = Array.isArray(item.loc) ? item.loc[item.loc.length - 1] : null
        const msg = String(item.msg || 'Invalid value').replace(/^Value error, /, '')
        return field && field !== 'body' ? `${field}: ${msg}` : msg
      })
      .join('. ')
  }
  return fallback
}

async function request(path, { method = 'GET', body, params } = {}) {
  const url = new URL(API_BASE_URL + path)
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value)
  })

  let response
  try {
    const token = accessTokenGetter ? await accessTokenGetter().catch(() => null) : null
    const headers = { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(
      `Cannot reach the server at ${API_BASE_URL}. Make sure the backend is running.`,
      0,
    )
  }

  if (response.status === 204) return null

  let data = null
  try {
    data = await response.json()
  } catch {
    // Non-JSON body: handled below.
  }

  if (!response.ok) {
    throw new ApiError(
      messageFromDetail(data?.detail, `Request failed (${response.status}).`),
      response.status,
    )
  }
  return data
}

const id = encodeURIComponent

export const api = {
  signup: (payload) => request('/api/auth/signup', { method: 'POST', body: payload }),
  login: (payload) => request('/api/auth/login', { method: 'POST', body: payload }),
  getMe: () => request('/api/me'),
  updateMe: (payload) => request('/api/me', { method: 'PUT', body: payload }),
  createOrganization: (payload) => request('/api/organizations', { method: 'POST', body: payload }),
  listMyOrganizations: () => request('/api/organizations/mine'),
  listPendingOrganizations: () => request('/api/admin/organizations'),
  decideOrganization: (organizationId, decision) => request(`/api/admin/organizations/${id(organizationId)}/decision`, { method: 'POST', params: { decision } }),
  listNotifications: () => request('/api/notifications'),
  getUnreadNotificationsCount: () => request('/api/notifications/unread-count'),
  readNotification: (notificationId) => request(`/api/notifications/${id(notificationId)}/read`, { method: 'POST' }),
  readAllNotifications: () => request('/api/notifications/read-all', { method: 'POST' }),
  getRecommendations: ({ eventId } = {}) =>
    request('/api/recommendations', { params: { event_id: eventId } }),
  // events
  listEvents: ({ q, category, includePast } = {}) =>
    request('/api/events', {
      params: { q, category, include_past: includePast ? 'true' : undefined },
    }),
  listCategories: () => request('/api/events/categories'),
  getEvent: (eventId) => request(`/api/events/${id(eventId)}`),
  createEvent: (payload) => request('/api/events', { method: 'POST', body: payload }),
  updateEvent: (eventId, payload) =>
    request(`/api/events/${id(eventId)}`, { method: 'PUT', body: payload }),
  deleteEvent: (eventId, { force = false } = {}) =>
    request(`/api/events/${id(eventId)}`, {
      method: 'DELETE',
      params: { force: force ? 'true' : undefined },
    }),

  // event registrations
  listEventRegistrations: (eventId) => request(`/api/events/${id(eventId)}/registrations`),
  registerForEvent: (eventId, student) =>
    request(`/api/events/${id(eventId)}/register`, { method: 'POST', body: student }),
  cancelEventRegistration: (eventId, studentId) =>
    request(`/api/events/${id(eventId)}/register/${id(studentId)}`, { method: 'DELETE' }),

  // duties
  listDuties: (eventId) => request(`/api/events/${id(eventId)}/duties`),
  createDuty: (eventId, payload) =>
    request(`/api/events/${id(eventId)}/duties`, { method: 'POST', body: payload }),
  updateDuty: (eventId, dutyId, payload) =>
    request(`/api/events/${id(eventId)}/duties/${id(dutyId)}`, { method: 'PUT', body: payload }),
  deleteDuty: (eventId, dutyId, { force = false } = {}) =>
    request(`/api/events/${id(eventId)}/duties/${id(dutyId)}`, {
      method: 'DELETE',
      params: { force: force ? 'true' : undefined },
    }),

  // duty registrations
  listDutyRegistrations: (eventId, dutyId) =>
    request(`/api/events/${id(eventId)}/duties/${id(dutyId)}/registrations`),
  registerForDuty: (eventId, dutyId, student) =>
    request(`/api/events/${id(eventId)}/duties/${id(dutyId)}/register`, {
      method: 'POST',
      body: student,
    }),
  cancelDutyRegistration: (eventId, dutyId, studentId) =>
    request(`/api/events/${id(eventId)}/duties/${id(dutyId)}/register/${id(studentId)}`, {
      method: 'DELETE',
    }),

  // attendance and verified hours
  setEventAttendance: (eventId, registrationId, payload) =>
    request(`/api/events/${id(eventId)}/registrations/${id(registrationId)}/attendance`, {
      method: 'PATCH',
      body: payload,
    }),
  setDutyAttendance: (eventId, dutyId, registrationId, payload) =>
    request(`/api/events/${id(eventId)}/duties/${id(dutyId)}/registrations/${id(registrationId)}/attendance`, {
      method: 'PATCH',
      body: payload,
    }),
  getStudentHours: (studentId) =>
    request(`/api/students/${id(studentId)}/hours`),

  // student history and organizer dashboard
  getStudentRegistrations: (studentId) =>
    request(`/api/students/${id(studentId)}/registrations`),
  getOrganizerSummary: (eventId) =>
    request(`/api/organizer/events/${id(eventId)}/summary`),
}
