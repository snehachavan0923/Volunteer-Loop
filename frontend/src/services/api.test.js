import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, messageFromDetail } from './api'

function mockFetch(status, body) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (body === undefined) throw new Error('no body')
      return body
    },
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => vi.unstubAllGlobals())

describe('messageFromDetail', () => {
  it('returns string details unchanged', () => {
    expect(messageFromDetail('This event is full.', 'x')).toBe('This event is full.')
  })
  it('joins validation errors with the field name', () => {
    const detail = [
      { loc: ['body', 'capacity'], msg: 'Input should be greater than 0' },
      { loc: ['body', 'title'], msg: 'String should have at least 1 character' },
    ]
    expect(messageFromDetail(detail, 'x')).toBe(
      'capacity: Input should be greater than 0. title: String should have at least 1 character',
    )
  })
  it('falls back when there is no detail', () => {
    expect(messageFromDetail(undefined, 'fallback')).toBe('fallback')
  })
})

describe('api client', () => {
  it('sends filters as query parameters and skips empty ones', async () => {
    const fetchMock = mockFetch(200, [])
    await api.listEvents({ q: 'tree', category: '', includePast: true })
    const url = fetchMock.mock.calls[0][0]
    expect(url.pathname).toBe('/api/events')
    expect(url.searchParams.get('q')).toBe('tree')
    expect(url.searchParams.has('category')).toBe(false)
    expect(url.searchParams.get('include_past')).toBe('true')
  })

  it('posts the registration payload as JSON to the contract path', async () => {
    const fetchMock = mockFetch(201, { message: 'ok' })
    await api.registerForEvent(7, { student_id: 'STU001', student_name: 'Rahul' })
    const [url, options] = fetchMock.mock.calls[0]
    expect(url.pathname).toBe('/api/events/7/register')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({ student_id: 'STU001', student_name: 'Rahul' })
  })

  it('encodes student ids in the cancel path', async () => {
    const fetchMock = mockFetch(200, {})
    await api.cancelDutyRegistration(1, 2, 'A/B 1')
    expect(fetchMock.mock.calls[0][0].pathname).toBe('/api/events/1/duties/2/register/A%2FB%201')
  })

  it('returns null for 204 responses', async () => {
    mockFetch(204)
    expect(await api.deleteEvent(3, { force: true })).toBeNull()
  })

  it('throws ApiError with the server message', async () => {
    mockFetch(400, { detail: 'This event is full. No seats are left.' })
    await expect(api.registerForEvent(1, { student_id: 'a', student_name: 'b' })).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      message: 'This event is full. No seats are left.',
    })
  })

  it('explains when the server cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const error = await api.listEvents().catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(0)
    expect(error.message).toMatch(/backend is running/i)
  })
})
