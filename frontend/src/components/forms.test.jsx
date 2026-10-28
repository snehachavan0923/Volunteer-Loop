import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EventForm from './EventForm'
import DutyForm from './DutyForm'
import RegistrationForm from './RegistrationForm'
import ConfirmDialog from './ConfirmDialog'

describe('EventForm', () => {
  it('shows an error for every missing field and does not submit', async () => {
    const onSubmit = vi.fn()
    render(<EventForm onSubmit={onSubmit} onCancel={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Save event' }))
    expect(screen.getByText('Title is required.')).toBeInTheDocument()
    expect(screen.getByText('Description is required.')).toBeInTheDocument()
    expect(screen.getByText('Location is required.')).toBeInTheDocument()
    expect(screen.getByText('Choose a valid date and time.')).toBeInTheDocument()
    expect(screen.getByText(/whole number of at least 1/)).toBeInTheDocument()
    expect(screen.getByText('Organizer name is required.')).toBeInTheDocument()
    expect(screen.getByText('Category is required.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits a clean payload with a UTC ISO date', async () => {
    const onSubmit = vi.fn()
    render(<EventForm onSubmit={onSubmit} onCancel={() => {}} />)
    await userEvent.type(screen.getByLabelText('Title'), '  Beach cleanup ')
    await userEvent.type(screen.getByLabelText('Description'), 'Pick up litter')
    await userEvent.type(screen.getByLabelText('Location'), 'Marina')
    await userEvent.type(screen.getByLabelText(/Date and time/), '2030-05-01T09:30')
    await userEvent.type(screen.getByLabelText('Capacity'), '25')
    await userEvent.type(screen.getByLabelText('Category'), 'Environment')
    await userEvent.type(screen.getByLabelText('Organizer name'), 'Green Club')
    await userEvent.click(screen.getByRole('button', { name: 'Save event' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const payload = onSubmit.mock.calls[0][0]
    expect(payload).toMatchObject({
      title: 'Beach cleanup',
      capacity: 25,
      category: 'Environment',
      organizer_name: 'Green Club',
    })
    expect(payload.event_date).toBe(new Date('2030-05-01T09:30').toISOString())
  })

  it('refuses a capacity below the active registrations', async () => {
    const onSubmit = vi.fn()
    const initial = {
      title: 'T', description: 'D', location: 'L', event_date: '2030-05-01T09:30:00Z',
      capacity: 10, organizer_name: 'O', category: 'C',
    }
    render(<EventForm initial={initial} minCapacity={6} onSubmit={onSubmit} onCancel={() => {}} />)
    const capacity = screen.getByLabelText(/Capacity/)
    await userEvent.clear(capacity)
    await userEvent.type(capacity, '4')
    await userEvent.click(screen.getByRole('button', { name: 'Save event' }))
    expect(screen.getByText(/cannot be lower than the 6 active/i)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('rejects a registration deadline after the event date', async () => {
    const onSubmit = vi.fn()
    render(<EventForm onSubmit={onSubmit} onCancel={() => {}} />)
    await userEvent.type(screen.getByLabelText('Title'), 'Beach cleanup')
    await userEvent.type(screen.getByLabelText('Description'), 'Pick up litter')
    await userEvent.type(screen.getByLabelText('Location'), 'Marina')
    await userEvent.type(screen.getByLabelText(/Date and time/), '2030-05-01T09:30')
    await userEvent.type(screen.getByLabelText(/Registration deadline/), '2030-05-02T09:30')
    await userEvent.type(screen.getByLabelText('Capacity'), '25')
    await userEvent.type(screen.getByLabelText('Category'), 'Environment')
    await userEvent.type(screen.getByLabelText('Organizer name'), 'Green Club')
    await userEvent.click(screen.getByRole('button', { name: 'Save event' }))

    expect(screen.getByText('Registration deadline must be on or before the event date.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows API errors passed in', () => {
    render(<EventForm error="Capacity cannot be lower than 3" onSubmit={() => {}} onCancel={() => {}} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Capacity cannot be lower than 3')
  })
})

describe('DutyForm', () => {
  it('rejects an end time before the start time', async () => {
    const onSubmit = vi.fn()
    render(<DutyForm onSubmit={onSubmit} onCancel={() => {}} />)
    await userEvent.type(screen.getByLabelText('Duty title'), 'Logistics')
    await userEvent.type(screen.getByLabelText('Description'), 'Carry chairs')
    await userEvent.type(screen.getByLabelText(/Volunteers needed/), '3')
    await userEvent.type(screen.getByLabelText(/Start time/), '2030-05-01T12:00')
    await userEvent.type(screen.getByLabelText(/End time/), '2030-05-01T10:00')
    await userEvent.click(screen.getByRole('button', { name: 'Save duty' }))
    expect(screen.getByText('End time must be after the start time.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('allows empty optional times', async () => {
    const onSubmit = vi.fn()
    render(<DutyForm onSubmit={onSubmit} onCancel={() => {}} />)
    await userEvent.type(screen.getByLabelText('Duty title'), 'Logistics')
    await userEvent.type(screen.getByLabelText('Description'), 'Carry chairs')
    await userEvent.type(screen.getByLabelText(/Volunteers needed/), '3')
    await userEvent.click(screen.getByRole('button', { name: 'Save duty' }))
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Logistics', description: 'Carry chairs', capacity: 3, start_time: null, end_time: null,
    })
  })
})

describe('RegistrationForm', () => {
  it('requires both student id and name', async () => {
    const onSubmit = vi.fn()
    render(<RegistrationForm onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect(screen.getByText('Enter your student ID.')).toBeInTheDocument()
    expect(screen.getByText('Enter your name.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('does not submit twice while busy', async () => {
    const onSubmit = vi.fn()
    render(<RegistrationForm initial={{ studentId: 'STU001', studentName: 'Rahul' }} busy onSubmit={onSubmit} />)
    expect(screen.getByRole('button', { name: 'Register' })).toBeDisabled()
  })
})

describe('ConfirmDialog', () => {
  it('calls the right handlers', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ConfirmDialog title="Delete?" message="Sure?" confirmLabel="Delete" onConfirm={onConfirm} onCancel={onCancel} />)
    expect(screen.getByRole('dialog', { name: 'Delete?' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('disables both buttons while busy', () => {
    render(<ConfirmDialog title="T" message="M" confirmLabel="Go" busy onConfirm={() => {}} onCancel={() => {}} />)
    expect(screen.getByRole('button', { name: 'Go' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Keep it' })).toBeDisabled()
  })
})
