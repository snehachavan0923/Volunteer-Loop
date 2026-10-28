import { describe, expect, it } from 'vitest'
import { messageFromDetail } from '../services/api'

describe('API error formatting used by event pages', () => {
  it('shows a backend business error clearly', () => {
    expect(messageFromDetail('This event is full.', 'Fallback')).toBe('This event is full.')
  })
  it('formats field validation errors', () => {
    expect(messageFromDetail([{ loc: ['body', 'capacity'], msg: 'Input should be greater than 0' }], 'Fallback')).toBe('capacity: Input should be greater than 0')
  })
})
