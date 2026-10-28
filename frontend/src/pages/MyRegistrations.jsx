import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Award, CalendarDays, CheckCircle2, ClipboardList, MapPin } from 'lucide-react'
import { api } from '../services/api'
import { useIdentity } from '../context/IdentityContext'
import { formatDateTime, formatTimeRange } from '../utils/format'
import ConfirmDialog from '../components/ConfirmDialog'
import EmptyState from '../components/EmptyState'
import ErrorMessage from '../components/ErrorMessage'
import LoadingState from '../components/LoadingState'
import SuccessMessage from '../components/SuccessMessage'

export default function MyRegistrations() {
  const { identity, login, logout } = useIdentity()
  const [history, setHistory] = useState(null)
  const [hoursData, setHoursData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirm, setConfirm] = useState(null) // { kind: 'event' | 'duty', eventReg, dutyReg? }
  const [busy, setBusy] = useState(false)
  const [confirmError, setConfirmError] = useState('')
  const requestSeq = useRef(0)

  const load = useCallback(async () => {
    if (!identity) return
    const seq = ++requestSeq.current
    try {
      const [regs, hours] = await Promise.all([
        api.getStudentRegistrations(identity.studentId),
        api.getStudentHours(identity.studentId),
      ])
      if (seq !== requestSeq.current) return
      setHistory(regs)
      setHoursData(hours)
      setLoadError('')
    } catch (err) {
      if (seq === requestSeq.current) setLoadError(err.message)
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }, [identity])

  useEffect(() => {
    setHistory(null)
    setHoursData(null)
    if (identity) {
      setLoading(true)
      load()
    }
  }, [identity, load])

  async function handleConfirm() {
    setBusy(true)
    setConfirmError('')
    try {
      if (confirm.kind === 'event') {
        const result = await api.cancelEventRegistration(
          confirm.eventReg.event.id,
          identity.studentId,
        )
        setNotice(
          result.cancelled_duty_registrations > 0
            ? `Cancelled "${confirm.eventReg.event.title}" and ${result.cancelled_duty_registrations} duty sign-up(s).`
            : `Cancelled "${confirm.eventReg.event.title}".`,
        )
      } else {
        await api.cancelDutyRegistration(
          confirm.eventReg.event.id,
          confirm.dutyReg.duty.id,
          identity.studentId,
        )
        setNotice(`You left the duty "${confirm.dutyReg.duty.title}". You're still registered for the event.`)
      }
      setConfirm(null)
      await load()
    } catch (err) {
      setConfirmError(err.message)
      load()
    } finally {
      setBusy(false)
    }
  }

  if (!identity) {
    return (
      <Page>
        <h1 className="text-2xl font-extrabold tracking-tight text-stone-900">My registrations</h1>
        <section className="card mt-6 max-w-2xl p-6">
          <h2 className="text-lg font-bold text-stone-900">Sign in to view your registrations</h2>
          <p className="mb-5 mt-1 text-sm text-stone-500">Your registrations and verified hours are linked securely to your VolunteerLoop account.</p>
          <button type="button" className="btn-primary" onClick={() => login()}>Log in / Sign up</button>
        </section>
      </Page>
    )
  }

  return (
    <Page>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-stone-900">My registrations</h1>
          <p className="mt-1 text-sm text-stone-500">
            Showing registrations for <strong>{identity.studentName}</strong>
          </p>
        </div>
        <div className="flex items-center gap-3">
          {hoursData !== null && (
            <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3.5 py-1.5 text-xs font-bold text-emerald-800 border border-emerald-200">
              <Award className="h-4 w-4 text-emerald-700" />
              <span>{hoursData.total_hours} Verified Hours</span>
            </div>
          )}
          <button type="button" className="btn-secondary btn-sm" onClick={logout}>Log out</button>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <SuccessMessage message={notice} onDismiss={() => setNotice('')} />
        {loadError && <ErrorMessage message={loadError} onRetry={load} />}
      </div>

      <div className="mt-6">
        {loading && !history ? (
          <LoadingState label="Loading your registrations…" />
        ) : history && history.event_registrations.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="You haven't registered for anything yet"
            message="Find an event you like and grab a seat."
            action={<Link to="/" className="btn-primary">Browse events</Link>}
          />
        ) : history ? (
          <ul className="space-y-5">
            {history.event_registrations.map((reg) => (
              <li key={reg.id} className="card p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="badge bg-emerald-50 text-emerald-800">{reg.event.category}</span>
                      {reg.attended ? (
                        <span className="badge bg-emerald-100 text-emerald-800 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Attended · {reg.hours_verified} hrs verified
                        </span>
                      ) : (
                        <span className="badge bg-stone-100 text-stone-600">Registered</span>
                      )}
                    </div>
                    <h2 className="mt-2 text-lg font-bold text-stone-900">
                      <Link to={`/events/${reg.event.id}`} className="hover:underline">
                        {reg.event.title}
                      </Link>
                    </h2>
                    <p className="mt-2 flex items-center gap-2 text-sm text-stone-600">
                      <CalendarDays className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                      {formatDateTime(reg.event.event_date)}
                    </p>
                    <p className="mt-1 flex items-center gap-2 text-sm text-stone-600">
                      <MapPin className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                      {reg.event.location}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => { setConfirmError(''); setConfirm({ kind: 'event', eventReg: reg }) }}
                  >
                    Cancel event registration
                  </button>
                </div>

                <div className="mt-5 border-t border-stone-100 pt-4">
                  <h3 className="text-sm font-bold text-stone-800">Your duties</h3>
                  {reg.duty_registrations.length === 0 ? (
                    <p className="mt-1.5 text-sm text-stone-500">
                      No duty yet.{' '}
                      <Link to={`/events/${reg.event.id}`} className="font-semibold text-emerald-800 hover:underline">
                        See the available duties
                      </Link>
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {reg.duty_registrations.map((d) => (
                        <li
                          key={d.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-stone-50 px-3.5 py-3"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-stone-800">{d.duty.title}</p>
                              {d.attended && (
                                <span className="badge bg-emerald-100 text-emerald-800 text-[10px]">
                                  Attended ({d.hours_verified} hrs)
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-stone-500">
                              {d.duty.description}
                              {formatTimeRange(d.duty.start_time, d.duty.end_time) &&
                                ` · ${formatTimeRange(d.duty.start_time, d.duty.end_time)}`}
                            </p>
                          </div>
                          <button
                            type="button"
                            className="btn-ghost btn-sm text-red-700"
                            onClick={() => { setConfirmError(''); setConfirm({ kind: 'duty', eventReg: reg, dutyReg: d }) }}
                          >
                            Cancel duty
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {confirm && (
        <ConfirmDialog
          title={confirm.kind === 'event' ? 'Cancel event registration?' : 'Cancel this duty?'}
          message={
            confirm.kind === 'event'
              ? `You will lose your seat in "${confirm.eventReg.event.title}"${
                  confirm.eventReg.duty_registrations.length
                    ? ' and all your duty sign-ups for it'
                    : ''
                }.`
              : `You will give up "${confirm.dutyReg.duty.title}". You stay registered for "${confirm.eventReg.event.title}".`
          }
          confirmLabel={confirm.kind === 'event' ? 'Cancel registration' : 'Cancel duty'}
          danger
          busy={busy}
          error={confirmError}
          onConfirm={handleConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </Page>
  )
}

function Page({ children }) {
  return <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</div>
}
