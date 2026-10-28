import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarDays,
  CalendarPlus,
  ChevronDown,
  Clock,
  MapPin,
  Pencil,
  Plus,
  Shield,
  Trash2,
  UserRound,
  Users,
} from 'lucide-react'
import { api } from '../services/api'
import { useIdentity } from '../context/IdentityContext'
import { formatDateTime, formatTimeRange, isPast } from '../utils/format'
import CapacityBar from '../components/CapacityBar'
import ConfirmDialog from '../components/ConfirmDialog'
import DutyForm from '../components/DutyForm'
import EmptyState from '../components/EmptyState'
import ErrorMessage from '../components/ErrorMessage'
import EventForm from '../components/EventForm'
import LoadingState from '../components/LoadingState'
import Modal from '../components/Modal'
import ParticipantList from '../components/ParticipantList'
import SuccessMessage from '../components/SuccessMessage'

export default function Organizer() {
  const { identity, profile, isAuthenticated, isLoading: authLoading, login } = useIdentity()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [summary, setSummary] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState('')

  const [modal, setModal] = useState(null) // { type: 'createEvent' | 'editEvent' | 'createDuty' | 'editDuty', duty? }
  const [confirm, setConfirm] = useState(null) // { type: 'deleteEvent' | 'deleteDuty', duty? }
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [showParticipants, setShowParticipants] = useState(false)
  const [openDutyId, setOpenDutyId] = useState(null)
  const summarySeq = useRef(0)

  const isOrganizerOrAdmin = Boolean(
    (profile?.roles || identity?.roles || []).some((r) => r === 'organizer' || r === 'admin')
  )

  const loadEvents = useCallback(async (preferId) => {
    try {
      const list = await api.listEvents({ includePast: true })
      setEvents(list)
      setError('')
      setSelectedId((current) =>
        current && list.some((e) => e.id === current) ? current : (preferId ?? list[0]?.id ?? null),
      )
      if (preferId) setSelectedId(preferId)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadSummary = useCallback(async (id) => {
    if (!id) {
      setSummary(null)
      return
    }
    const seq = ++summarySeq.current
    setSummaryLoading(true)
    try {
      const result = await api.getOrganizerSummary(id)
      if (seq !== summarySeq.current) return
      setSummary(result)
      setSummaryError('')
    } catch (err) {
      if (seq === summarySeq.current) setSummaryError(err.message)
    } finally {
      if (seq === summarySeq.current) setSummaryLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAuthenticated && isOrganizerOrAdmin) {
      loadEvents()
    } else {
      setLoading(false)
    }
  }, [isAuthenticated, isOrganizerOrAdmin, loadEvents])

  useEffect(() => {
    setShowParticipants(false)
    setOpenDutyId(null)
    setSummary(null)
    if (selectedId && isOrganizerOrAdmin) {
      loadSummary(selectedId)
    }
  }, [selectedId, isOrganizerOrAdmin, loadSummary])

  function closeModal() {
    if (busy) return
    setModal(null)
    setFormError('')
  }

  async function mutate(action, successMessage, { onDone } = {}) {
    setBusy(true)
    setFormError('')
    try {
      const result = await action()
      setModal(null)
      setConfirm(null)
      setNotice(successMessage)
      await onDone?.(result)
      return true
    } catch (err) {
      setFormError(err.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  const refreshAll = async () => {
    await Promise.all([loadEvents(), loadSummary(selectedId)])
  }

  const handleCreateEvent = (payload) =>
    mutate(() => api.createEvent(payload), 'Event created.', {
      onDone: (created) => loadEvents(created.id),
    })

  const handleEditEvent = (payload) =>
    mutate(() => api.updateEvent(selectedId, payload), 'Event updated.', { onDone: refreshAll })

  const handleDeleteEvent = () =>
    mutate(
      () => api.deleteEvent(selectedId, { force: summary.event.registered_count > 0 }),
      'Event deleted.',
      { onDone: () => loadEvents() },
    )

  const handleCreateDuty = (payload) =>
    mutate(() => api.createDuty(selectedId, payload), 'Duty added.', { onDone: refreshAll })

  const handleEditDuty = (payload) =>
    mutate(() => api.updateDuty(selectedId, modal.duty.id, payload), 'Duty updated.', {
      onDone: refreshAll,
    })

  const handleDeleteDuty = () =>
    mutate(
      () => api.deleteDuty(selectedId, confirm.duty.id, { force: confirm.duty.registered_count > 0 }),
      'Duty deleted.',
      { onDone: refreshAll },
    )

  const handleEventAttendance = async (regId, payload) => {
    await api.setEventAttendance(selectedId, regId, payload)
    await loadSummary(selectedId)
    setNotice('Participant attendance and verified hours updated.')
  }

  const handleDutyAttendance = async (dutyId, regId, payload) => {
    await api.setDutyAttendance(selectedId, dutyId, regId, payload)
    await loadSummary(selectedId)
    setNotice('Duty volunteer attendance and verified hours updated.')
  }

  if (authLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 text-center">
        <LoadingState label="Verifying organizer credentials…" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="card p-8">
          <Shield className="mx-auto h-12 w-12 text-emerald-700" />
          <h1 className="mt-4 text-2xl font-extrabold text-stone-900">Organizer Sign In Required</h1>
          <p className="mt-2 text-stone-600">
            Sign in with your approved organizer account to create events, manage duties, and record volunteer hours.
          </p>
          <button type="button" className="btn-primary mt-6" onClick={() => login()}>
            Log in / Sign up
          </button>
        </div>
      </div>
    )
  }

  if (!isOrganizerOrAdmin) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="card p-8">
          <Shield className="mx-auto h-12 w-12 text-amber-600" />
          <h1 className="mt-4 text-2xl font-extrabold text-stone-900">Organizer Access Required</h1>
          <p className="mt-2 text-stone-600">
            Your account currently has the student role. To publish and manage events for a college club or organization, submit your organization application on your Account page.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link to="/account" className="btn-primary">
              Apply for Organizer Access
            </Link>
            <Link to="/" className="btn-secondary">
              Browse Events
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const eventModal = modal?.type === 'createEvent' || modal?.type === 'editEvent'
  const dutyModal = modal?.type === 'createDuty' || modal?.type === 'editDuty'

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-stone-900">Organizer dashboard</h1>
          <p className="mt-1 text-sm text-stone-500">
            Create events, publish duties, and manage participant attendance.
          </p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => { setFormError(''); setModal({ type: 'createEvent' }) }}
        >
          <CalendarPlus className="h-4 w-4" aria-hidden="true" /> Create event
        </button>
      </div>

      <div className="mt-5 space-y-4">
        <SuccessMessage message={notice} onDismiss={() => setNotice('')} />
        {error && <ErrorMessage message={error} onRetry={() => loadEvents()} />}
      </div>

      {loading ? (
        <LoadingState label="Loading events…" />
      ) : events.length === 0 && !error ? (
        <div className="mt-6">
          <EmptyState
            icon={CalendarPlus}
            title="No events yet"
            message="Create your first volunteering event to get started."
            action={
              <button type="button" className="btn-primary" onClick={() => setModal({ type: 'createEvent' })}>
                Create event
              </button>
            }
          />
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
          <nav aria-label="Your events" className="space-y-2">
            {events.map((e) => (
              <button
                key={e.id}
                type="button"
                aria-pressed={selectedId === e.id}
                onClick={() => setSelectedId(e.id)}
                className={`w-full rounded-2xl border p-4 text-left transition ${
                  selectedId === e.id
                    ? 'border-emerald-600 bg-emerald-50/70 shadow-sm'
                    : 'border-stone-200 bg-white hover:border-stone-300'
                }`}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="font-bold text-stone-900">{e.title}</span>
                  {isPast(e.event_date) && <span className="badge bg-stone-100 text-stone-600">Past</span>}
                </span>
                <span className="mt-1.5 block text-xs text-stone-500">{formatDateTime(e.event_date)}</span>
                <span className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-stone-700">
                  <Users className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
                  {e.registered_count}/{e.capacity} registered · {e.remaining_seats} left
                </span>
              </button>
            ))}
          </nav>

          <section aria-live="polite">
            {summaryLoading && !summary ? (
              <LoadingState label="Loading event…" />
            ) : summaryError && !summary ? (
              <ErrorMessage message={summaryError} onRetry={() => loadSummary(selectedId)} />
            ) : summary ? (
              <EventPanel
                summary={summary}
                showParticipants={showParticipants}
                onToggleParticipants={() => setShowParticipants((s) => !s)}
                openDutyId={openDutyId}
                onToggleDuty={(id) => setOpenDutyId((cur) => (cur === id ? null : id))}
                onEdit={() => { setFormError(''); setModal({ type: 'editEvent' }) }}
                onDelete={() => { setFormError(''); setConfirm({ type: 'deleteEvent' }) }}
                onAddDuty={() => { setFormError(''); setModal({ type: 'createDuty' }) }}
                onEditDuty={(duty) => { setFormError(''); setModal({ type: 'editDuty', duty }) }}
                onDeleteDuty={(duty) => { setFormError(''); setConfirm({ type: 'deleteDuty', duty }) }}
                onUpdateEventAttendance={handleEventAttendance}
                onUpdateDutyAttendance={handleDutyAttendance}
              />
            ) : null}
          </section>
        </div>
      )}

      {eventModal && (
        <Modal
          title={modal.type === 'createEvent' ? 'Create event' : 'Edit event'}
          onClose={closeModal}
          wide
        >
          <EventForm
            initial={modal.type === 'editEvent' ? summary?.event : undefined}
            minCapacity={modal.type === 'editEvent' ? Math.max(1, summary?.event.registered_count || 1) : 1}
            submitLabel={modal.type === 'createEvent' ? 'Create event' : 'Save changes'}
            busy={busy}
            error={formError}
            onSubmit={modal.type === 'createEvent' ? handleCreateEvent : handleEditEvent}
            onCancel={closeModal}
          />
        </Modal>
      )}

      {dutyModal && (
        <Modal title={modal.type === 'createDuty' ? 'Add duty' : 'Edit duty'} onClose={closeModal} wide>
          <DutyForm
            initial={modal.type === 'editDuty' ? modal.duty : undefined}
            minCapacity={modal.type === 'editDuty' ? Math.max(1, modal.duty.registered_count) : 1}
            submitLabel={modal.type === 'createDuty' ? 'Add duty' : 'Save changes'}
            busy={busy}
            error={formError}
            onSubmit={modal.type === 'createDuty' ? handleCreateDuty : handleEditDuty}
            onCancel={closeModal}
          />
        </Modal>
      )}

      {confirm?.type === 'deleteEvent' && summary && (
        <ConfirmDialog
          title="Delete this event?"
          message={
            summary.event.registered_count > 0
              ? `"${summary.event.title}" has ${summary.event.registered_count} active registration(s). Deleting it permanently removes the event, all its duties and every registration. This cannot be undone.`
              : `"${summary.event.title}" and its duties will be permanently deleted. This cannot be undone.`
          }
          confirmLabel="Delete event"
          cancelLabel="Keep event"
          danger
          busy={busy}
          error={formError}
          onConfirm={handleDeleteEvent}
          onCancel={() => !busy && setConfirm(null)}
        />
      )}

      {confirm?.type === 'deleteDuty' && (
        <ConfirmDialog
          title="Delete this duty?"
          message={
            confirm.duty.registered_count > 0
              ? `"${confirm.duty.title}" has ${confirm.duty.registered_count} volunteer(s) signed up. They stay registered for the event, but lose this duty. This cannot be undone.`
              : `"${confirm.duty.title}" will be permanently deleted.`
          }
          confirmLabel="Delete duty"
          cancelLabel="Keep duty"
          danger
          busy={busy}
          error={formError}
          onConfirm={handleDeleteDuty}
          onCancel={() => !busy && setConfirm(null)}
        />
      )}
    </div>
  )
}

function EventPanel({
  summary,
  showParticipants,
  onToggleParticipants,
  openDutyId,
  onToggleDuty,
  onEdit,
  onDelete,
  onAddDuty,
  onEditDuty,
  onDeleteDuty,
  onUpdateEventAttendance,
  onUpdateDutyAttendance,
}) {
  const { event, participants, duties } = summary
  return (
    <div className="space-y-6">
      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="badge bg-emerald-50 text-emerald-800">{event.category}</span>
            <h2 className="mt-2 text-xl font-extrabold text-stone-900">{event.title}</h2>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary btn-sm" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
            </button>
            <button type="button" className="btn-secondary btn-sm text-red-700" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete
            </button>
          </div>
        </div>
        <p className="mt-3 text-sm text-stone-600">{event.description}</p>
        <ul className="mt-4 grid gap-2 text-sm text-stone-700 sm:grid-cols-3">
          <li className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-emerald-700" aria-hidden="true" /> {formatDateTime(event.event_date)}
          </li>
          <li className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-emerald-700" aria-hidden="true" /> {event.location}
          </li>
          <li className="flex items-center gap-2">
            <UserRound className="h-4 w-4 text-emerald-700" aria-hidden="true" /> {event.organizer_name}
          </li>
          {event.registration_deadline && (
            <li className="flex items-center gap-2 sm:col-span-3 text-xs text-amber-800 bg-amber-50 rounded-lg p-2">
              <Clock className="h-3.5 w-3.5 text-amber-700" aria-hidden="true" />
              Registration deadline: {formatDateTime(event.registration_deadline)}
            </li>
          )}
        </ul>
        <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <CapacityBar used={event.registered_count} total={event.capacity} label="seats" />
          <button
            type="button"
            className="btn-secondary btn-sm"
            aria-expanded={showParticipants}
            onClick={onToggleParticipants}
          >
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            {showParticipants ? 'Hide participants' : `View participants (${participants.length})`}
          </button>
        </div>
        {showParticipants && (
          <div className="mt-4">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-stone-500">
              Event Attendance & Hours Verification
            </h3>
            <ParticipantList
              participants={participants}
              onUpdateAttendance={onUpdateEventAttendance}
            />
          </div>
        )}
      </div>

      <div className="card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-stone-900">Duties ({duties.length})</h2>
          <button type="button" className="btn-primary btn-sm" onClick={onAddDuty}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add duty
          </button>
        </div>

        {duties.length === 0 ? (
          <p className="rounded-xl bg-stone-50 px-4 py-6 text-center text-sm text-stone-500">
            No duties yet. Add duties like "Registration desk" so students can pick one after joining.
          </p>
        ) : (
          <ul className="space-y-3">
            {duties.map((duty) => {
              const open = openDutyId === duty.id
              const time = formatTimeRange(duty.start_time, duty.end_time)
              return (
                <li key={duty.id} className="rounded-xl border border-stone-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-bold text-stone-900">{duty.title}</h3>
                      <p className="mt-0.5 text-sm text-stone-600">{duty.description}</p>
                      {time && (
                        <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-stone-500">
                          <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {time}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      <button type="button" className="btn-secondary btn-sm" onClick={() => onEditDuty(duty)} aria-label={`Edit duty ${duty.title}`}>
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
                      </button>
                      <button type="button" className="btn-secondary btn-sm text-red-700" onClick={() => onDeleteDuty(duty)} aria-label={`Delete duty ${duty.title}`}>
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete
                      </button>
                    </div>
                  </div>
                  <div className="mt-3">
                    <CapacityBar used={duty.registered_count} total={duty.capacity} label="openings" />
                  </div>
                  <button
                    type="button"
                    className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 hover:underline"
                    aria-expanded={open}
                    onClick={() => onToggleDuty(duty.id)}
                  >
                    <ChevronDown className={`h-3.5 w-3.5 transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                    {open ? 'Hide volunteers' : `View volunteers (${duty.participants.length})`}
                  </button>
                  {open && (
                    <div className="mt-3">
                      <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-stone-500">
                        Duty Attendance & Hours Verification
                      </h4>
                      <ParticipantList
                        participants={duty.participants}
                        emptyText="No volunteers have signed up for this duty."
                        onUpdateAttendance={(regId, payload) => onUpdateDutyAttendance(duty.id, regId, payload)}
                      />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
