import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarDays, Clock, Info, MapPin, Sparkles, UserRound, Users } from 'lucide-react'
import { api } from '../services/api'
import { useIdentity } from '../context/IdentityContext'
import { formatDateTime, isPast } from '../utils/format'
import CapacityBar from '../components/CapacityBar'
import ConfirmDialog from '../components/ConfirmDialog'
import DutyCard from '../components/DutyCard'
import ErrorMessage from '../components/ErrorMessage'
import LoadingState from '../components/LoadingState'
import ParticipantList from '../components/ParticipantList'
import SuccessMessage from '../components/SuccessMessage'

export default function EventDetails() {
  const { eventId } = useParams()
  const { identity, login } = useIdentity()

  const [data, setData] = useState(null) // { event, duties, participants, mine }
  const [recommendations, setRecommendations] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [busyKey, setBusyKey] = useState(null) // 'event' | 'duty-<id>' while a request runs
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const [confirmLeave, setConfirmLeave] = useState(false)

  const requestSeq = useRef(0)

  const load = useCallback(
    async (studentId) => {
      const seq = ++requestSeq.current
      try {
        const [event, duties, participants, mine, recs] = await Promise.all([
          api.getEvent(eventId),
          api.listDuties(eventId),
          api.listEventRegistrations(eventId),
          studentId ? api.getStudentRegistrations(studentId) : Promise.resolve(null),
          api.getRecommendations({ eventId }).catch(() => []),
        ])
        if (seq !== requestSeq.current) return
        setData({ event, duties, participants, mine })
        setRecommendations(recs)
        setLoadError('')
      } catch (err) {
        if (seq !== requestSeq.current) return
        setLoadError(err.message)
      } finally {
        if (seq === requestSeq.current) setLoading(false)
      }
    },
    [eventId],
  )

  useEffect(() => {
    setLoading(true)
    setData(null)
    load(identity?.studentId)
  }, [load, identity?.studentId])

  async function run(key, action, successMessage) {
    setBusyKey(key)
    setNotice('')
    setActionError('')
    try {
      const result = await action()
      setNotice(typeof successMessage === 'function' ? successMessage(result) : successMessage)
      return true
    } catch (err) {
      setActionError(err.message)
      return false
    } finally {
      setBusyKey(null)
    }
  }

  async function handleRegister() {
    if (!identity) {
      await login()
      return
    }
    await run(
      'event',
      async () => {
        await api.registerForEvent(eventId, {
          student_id: identity.studentId,
          student_name: identity.studentName,
        })
        await load(identity.studentId)
      },
      "You're registered! Pick a duty below if you'd like to help with something specific.",
    )
    load(identity?.studentId)
  }

  async function handleLeaveEvent() {
    const ok = await run(
      'event',
      async () => {
        const result = await api.cancelEventRegistration(eventId, identity.studentId)
        await load(identity.studentId)
        return result
      },
      (result) =>
        result.cancelled_duty_registrations > 0
          ? `Your registration was cancelled, along with ${result.cancelled_duty_registrations} duty sign-up(s).`
          : 'Your registration was cancelled.',
    )
    setConfirmLeave(false)
    if (!ok) load(identity.studentId)
  }

  async function handleDuty(duty, join) {
    await run(
      `duty-${duty.id}`,
      async () => {
        if (join) {
          await api.registerForDuty(eventId, duty.id, {
            student_id: identity.studentId,
            student_name: identity.studentName,
          })
        } else {
          await api.cancelDutyRegistration(eventId, duty.id, identity.studentId)
        }
        await load(identity.studentId)
      },
      join ? `You're signed up for "${duty.title}".` : `You left "${duty.title}".`,
    )
    load(identity?.studentId)
  }

  if (loading) return <Page><LoadingState label="Loading event…" /></Page>
  if (loadError && !data) {
    return (
      <Page>
        <ErrorMessage message={loadError} onRetry={() => { setLoading(true); load(identity?.studentId) }} />
      </Page>
    )
  }
  if (!data) return null

  const { event, duties, participants, mine } = data
  const myEventReg = mine?.event_registrations.find((r) => r.event.id === event.id && r.status === 'active') || null
  const myDutyIds = new Set((myEventReg?.duty_registrations || []).filter((d) => d.status === 'active').map((d) => d.duty.id))
  const full = event.remaining_seats === 0
  const isEventPast = isPast(event.event_date)
  const isDeadlinePassed = event.registration_deadline && isPast(event.registration_deadline)
  const isCancelled = event.status === 'cancelled'

  return (
    <Page>
      <Link to="/" className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-800 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All events
      </Link>

      <div className="space-y-4">
        <SuccessMessage message={notice} onDismiss={() => setNotice('')} />
        <ErrorMessage message={actionError} onDismiss={() => setActionError('')} />
        {loadError && <ErrorMessage message={loadError} onRetry={() => load(identity?.studentId)} />}
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <section className="card p-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge bg-emerald-50 text-emerald-800">{event.category}</span>
              {isCancelled && <span className="badge bg-red-100 text-red-800">Cancelled</span>}
              {isEventPast && <span className="badge bg-stone-100 text-stone-600">Already took place</span>}
              {!isEventPast && isDeadlinePassed && <span className="badge bg-amber-100 text-amber-800">Registration closed</span>}
            </div>
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-stone-900 sm:text-3xl">
              {event.title}
            </h1>
            <p className="mt-3 whitespace-pre-line text-stone-600">{event.description}</p>
            <ul className="mt-5 grid gap-3 text-sm text-stone-700 sm:grid-cols-2">
              <li className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                {formatDateTime(event.event_date)}
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                {event.location}
              </li>
              <li className="flex items-center gap-2">
                <UserRound className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                Organized by {event.organizer_name}
              </li>
              <li className="flex items-center gap-2">
                <Users className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                {event.registered_count} registered · {event.remaining_seats} seats left
              </li>
              {event.registration_deadline && (
                <li className="flex items-center gap-2 sm:col-span-2 text-amber-900 bg-amber-50 rounded-lg p-2.5">
                  <Clock className="h-4 w-4 text-amber-700 shrink-0" aria-hidden="true" />
                  <span>
                    <strong>Registration deadline:</strong> {formatDateTime(event.registration_deadline)}
                    {isDeadlinePassed && ' (Passed)'}
                  </span>
                </li>
              )}
            </ul>
          </section>

          <section className="card p-6" aria-labelledby="duties-heading">
            <h2 id="duties-heading" className="text-lg font-bold text-stone-900">
              Volunteer duties
            </h2>
            <p className="mt-1 flex items-start gap-2 text-sm text-stone-500">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              You need to register for the event first. After that you can sign up for one or more
              duties, and cancel a duty without leaving the event.
            </p>
            <div className="mt-5 space-y-3">
              {duties.length === 0 ? (
                <p className="rounded-xl bg-stone-50 px-4 py-6 text-center text-sm text-stone-500">
                  The organizer hasn't added any duties to this event. You can still register as a
                  participant.
                </p>
              ) : (
                duties.map((duty) => {
                  let state = 'available'
                  if (!myEventReg) state = 'locked'
                  else if (myDutyIds.has(duty.id)) state = 'registered'
                  else if (duty.remaining_openings === 0) state = 'full'
                  return (
                    <DutyCard
                      key={duty.id}
                      duty={duty}
                      state={state}
                      busy={busyKey === `duty-${duty.id}`}
                      lockedReason="Register for the event first to sign up for this duty."
                      onRegister={() => handleDuty(duty, true)}
                      onCancel={() => handleDuty(duty, false)}
                    />
                  )
                })
              )}
            </div>
          </section>

          <section className="card p-6" aria-labelledby="participants-heading">
            <h2 id="participants-heading" className="mb-4 text-lg font-bold text-stone-900">
              Who's coming ({participants.length})
            </h2>
            <ParticipantList
              participants={participants}
              showIds={false}
              emptyText="Nobody has registered yet. Be the first!"
            />
          </section>

          {/* Related Opportunities based on this event category & student interests */}
          {recommendations.length > 0 && (
            <section className="card p-6">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-5 w-5 text-emerald-700" />
                <h2 className="text-lg font-bold text-stone-900">Related Volunteering Opportunities</h2>
              </div>
              <ul className="divide-y divide-stone-100">
                {recommendations.slice(0, 3).map((rec) => (
                  <li key={rec.id} className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <Link to={`/events/${rec.id}`} className="font-bold text-emerald-800 hover:underline">
                        {rec.title}
                      </Link>
                      <p className="text-xs text-stone-500">{rec.category} · {rec.location} · {formatDateTime(rec.event_date)}</p>
                    </div>
                    <span className="badge bg-stone-100 text-stone-700 text-xs">
                      {rec.remaining_seats} seats left
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <section className="card p-6" aria-labelledby="register-heading">
            <h2 id="register-heading" className="text-lg font-bold text-stone-900">
              {myEventReg ? 'You are registered' : 'Register for this event'}
            </h2>
            <div className="mt-4">
              <CapacityBar used={event.registered_count} total={event.capacity} label="seats" />
            </div>

            <div className="mt-5">
              {myEventReg ? (
                <div className="space-y-4">
                  <p className="text-sm text-stone-600">
                    Registered as <strong>{identity.studentName}</strong>.
                    {myEventReg.duty_registrations.length > 0 &&
                      ` You have ${myEventReg.duty_registrations.length} duty sign-up(s).`}
                  </p>
                  <button
                    type="button"
                    className="btn-secondary w-full"
                    disabled={busyKey === 'event'}
                    onClick={() => setConfirmLeave(true)}
                  >
                    Cancel my registration
                  </button>
                </div>
              ) : !identity ? (
                <div className="space-y-3">
                  <p className="text-sm text-stone-600">Sign in with your VolunteerLoop account to register for this event.</p>
                  <button type="button" className="btn-primary w-full" onClick={() => login()}>
                    Log in / Sign up
                  </button>
                </div>
              ) : isCancelled ? (
                <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  This event has been cancelled by the organizer.
                </p>
              ) : isEventPast ? (
                <p className="rounded-xl bg-stone-100 px-4 py-3 text-sm font-medium text-stone-600">
                  This event has already taken place.
                </p>
              ) : isDeadlinePassed ? (
                <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                  The registration deadline for this event has passed.
                </p>
              ) : full ? (
                <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  This event is full. If someone cancels, a seat will open up.
                </p>
              ) : (
                <>
                  <p className="mb-3 text-sm text-stone-600">Registering as <strong>{identity.studentName}</strong>.</p>
                  <button
                    type="button"
                    className="btn-primary w-full"
                    disabled={busyKey === 'event'}
                    onClick={() => handleRegister()}
                  >
                    Register for event
                  </button>
                </>
              )}
            </div>
          </section>
        </aside>
      </div>

      {confirmLeave && (
        <ConfirmDialog
          title="Cancel your registration?"
          message={`You will give up your seat in "${event.title}"${
            myEventReg?.duty_registrations.length
              ? ' and your duty sign-ups for this event will be cancelled too'
              : ''
          }. You can register again later if seats are available.`}
          confirmLabel="Yes, cancel registration"
          danger
          busy={busyKey === 'event'}
          onConfirm={handleLeaveEvent}
          onCancel={() => setConfirmLeave(false)}
        />
      )}
    </Page>
  )
}

function Page({ children }) {
  return <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</div>
}
