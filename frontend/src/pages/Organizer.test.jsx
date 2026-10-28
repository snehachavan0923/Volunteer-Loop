import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Organizer from './Organizer'

const mocks = vi.hoisted(() => ({
  identity: null,
  getOrganizerDashboard: vi.fn(),
  getOrganizerSummary: vi.fn(),
}))

vi.mock('../context/IdentityContext', () => ({
  useIdentity: () => mocks.identity,
}))

vi.mock('../services/api', () => ({
  api: {
    getOrganizerDashboard: mocks.getOrganizerDashboard,
    getOrganizerSummary: mocks.getOrganizerSummary,
  },
}))

function dashboard(title) {
  return {
    status: 'approved',
    organizations: [],
    events: [{
      id: title.toLowerCase().replaceAll(' ', '-'),
      title,
      event_date: '2030-05-01T10:00:00Z',
      registered_count: 0,
      capacity: 10,
      remaining_seats: 10,
    }],
  }
}

function tree() {
  return <MemoryRouter><Organizer /></MemoryRouter>
}

describe('Organizer dashboard identity isolation', () => {
  beforeEach(() => {
    mocks.identity = {
      identity: { studentId: 'organizer-one', studentName: 'Organizer One', roles: ['organizer'] },
      profile: { roles: ['organizer'] },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
    }
    mocks.getOrganizerDashboard.mockReset()
    mocks.getOrganizerSummary.mockReset().mockRejectedValue(new Error('Summary unavailable'))
  })

  it('clears the previous dashboard on logout and when another organizer signs in', async () => {
    mocks.getOrganizerDashboard
      .mockResolvedValueOnce(dashboard('Organizer One Private Event'))
      .mockResolvedValueOnce(dashboard('Organizer Two Private Event'))

    const view = render(tree())
    expect(await screen.findByText('Organizer One Private Event')).toBeInTheDocument()

    mocks.identity = {
      identity: null,
      profile: null,
      isAuthenticated: false,
      isLoading: false,
      login: vi.fn(),
    }
    view.rerender(tree())
    expect(screen.queryByText('Organizer One Private Event')).not.toBeInTheDocument()
    expect(screen.getByText('Organizer Sign In Required')).toBeInTheDocument()

    mocks.identity = {
      identity: { studentId: 'organizer-two', studentName: 'Organizer Two', roles: ['organizer'] },
      profile: { roles: ['organizer'] },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
    }
    view.rerender(tree())

    expect(await screen.findByText('Organizer Two Private Event')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText('Organizer One Private Event')).not.toBeInTheDocument()
    })
    expect(mocks.getOrganizerDashboard).toHaveBeenCalledTimes(2)
  })

  it('shows a first-event action for an approved organization with no events', async () => {
    mocks.getOrganizerDashboard.mockResolvedValueOnce({ status: 'approved', organizations: [], events: [] })
    render(tree())

    expect(await screen.findByText('No events yet')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Create event/ })).toHaveLength(2)
  })

  it('shows the pending-approval state without loading event summaries', async () => {
    mocks.getOrganizerDashboard.mockResolvedValueOnce({ status: 'pending', organizations: [], events: [] })
    render(tree())

    expect(await screen.findByText('Organization approval pending')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View application status' })).toHaveAttribute('href', '/account')
    expect(mocks.getOrganizerSummary).not.toHaveBeenCalled()
  })
})
