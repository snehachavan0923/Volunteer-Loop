import { useEffect, useState } from 'react'
import { Award, Bell, CheckCheck, Clock, ShieldCheck, Sparkles } from 'lucide-react'
import { api } from '../services/api'
import { useIdentity } from '../context/IdentityContext'

const ALL_INTERESTS = ['Environment', 'Health', 'Education', 'Community', 'Cultural', 'Sports']

export default function Account() {
  const { identity, profile, isAuthenticated, login } = useIdentity()
  const [orgs, setOrgs] = useState([])
  const [orgsLoading, setOrgsLoading] = useState(false)
  const [pending, setPending] = useState([])
  const [notifications, setNotifications] = useState([])
  const [recommendations, setRecommendations] = useState([])
  const [hoursData, setHoursData] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    name: '',
    organization_type: 'College club',
    description: '',
    contact_name: '',
    contact_email: '',
  })

  const [profileName, setProfileName] = useState('')
  const [selectedInterests, setSelectedInterests] = useState([])
  const [profileSaving, setProfileSaving] = useState(false)

  const identityKey = identity?.studentId

  useEffect(() => {
    let active = true
    setOrgs([])
    setPending([])
    setNotifications([])
    setRecommendations([])
    setHoursData(null)
    setError('')
    if (!identityKey) {
      setOrgsLoading(false)
      return () => { active = false }
    }

    setOrgsLoading(true)
    setForm((f) => ({
      ...f,
      contact_name: identity.studentName,
      contact_email: identity.email || '',
    }))
    setProfileName(profile?.name || identity.studentName || '')
    setSelectedInterests(profile?.interests || identity.interests || [])

    Promise.all([
      api.listMyOrganizations(),
      api.listNotifications(),
      api.getRecommendations(),
      api.getStudentHours(identityKey),
    ])
      .then(([o, n, r, h]) => {
        if (!active) return
        setOrgs(o)
        setNotifications(n)
        setRecommendations(r)
        setHoursData(h)
      })
      .catch((e) => { if (active) setError(e.message) })
      .finally(() => { if (active) setOrgsLoading(false) })

    if ((profile?.roles || []).includes('admin')) {
      api.listPendingOrganizations()
        .then((items) => { if (active) setPending(items) })
        .catch((e) => { if (active) setError(e.message) })
    }
    return () => { active = false }
  }, [identityKey])

  async function handleProfileSave(e) {
    e.preventDefault()
    setProfileSaving(true)
    setMessage('')
    setError('')
    try {
      await api.updateMe({
        name: profileName.trim(),
        interests: selectedInterests,
      })
      setMessage('Profile and volunteering interests updated.')
      const updatedRecs = await api.getRecommendations()
      setRecommendations(updatedRecs)
    } catch (err) {
      setError(err.message)
    } finally {
      setProfileSaving(false)
    }
  }

  function toggleInterest(cat) {
    setSelectedInterests((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    )
  }

  async function decide(id, decision) {
    try {
      await api.decideOrganization(id, decision)
      setPending(await api.listPendingOrganizations())
      setMessage(decision === 'approve' ? 'Organization approved.' : 'Organization rejected.')
    } catch (e) {
      setError(e.message)
    }
  }

  async function submitOrg(e) {
    e.preventDefault()
    setMessage('')
    setError('')
    try {
      await api.createOrganization(form)
      setMessage('Organization application submitted. You can publish events after an admin approves it.')
      setOrgs(await api.listMyOrganizations())
    } catch (e) {
      setError(e.message)
    }
  }

  async function markNotificationRead(notifId) {
    try {
      await api.readNotification(notifId)
      setNotifications((prev) =>
        prev.map((n) => (n.id === notifId ? { ...n, read: true } : n))
      )
    } catch (err) {
      setError(err.message)
    }
  }

  async function markAllNotificationsRead() {
    try {
      await api.readAllNotifications()
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
      setMessage('All notifications marked as read.')
    } catch (err) {
      setError(err.message)
    }
  }

  if (!isAuthenticated) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-3xl font-extrabold text-stone-900">Your Account</h1>
        <p className="mt-2 text-stone-600">
          Sign in to view verified volunteering hours, manage profile interests, submit organization applications, and check notifications.
        </p>
        <button className="btn-primary mt-6" onClick={() => login()}>
          Log in / Sign up
        </button>
      </main>
    )
  }

  const unreadCount = notifications.filter((n) => !n.read).length
  const hasActiveApplication = orgs.some((organization) =>
    ['pending', 'approved'].includes(organization.status),
  )

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-stone-900">Your Account</h1>
          <p className="mt-1 text-sm text-stone-600">
            {identity?.email} · Roles: <span className="font-semibold text-emerald-800">{(profile?.roles || identity?.roles || ['student']).join(', ')}</span>
          </p>
        </div>
      </header>

      {message && <p className="rounded-xl bg-emerald-50 p-4 text-sm font-medium text-emerald-800 border border-emerald-200">{message}</p>}
      {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm font-medium text-red-700 border border-red-200">{error}</p>}

      {/* 1. Verified Volunteering Hours */}
      <section className="card p-6">
        <div className="flex items-center gap-2 mb-3">
          <Award className="h-6 w-6 text-emerald-700" />
          <h2 className="text-xl font-bold text-stone-900">Verified Volunteering Hours</h2>
        </div>
        <p className="text-sm text-stone-600">
          Hours confirmed and verified by event organizers.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-emerald-50 p-4 text-center">
            <span className="block text-3xl font-extrabold text-emerald-800">
              {hoursData?.total_hours ?? 0}
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
              Total Hours
            </span>
          </div>
          <div className="rounded-xl bg-stone-50 p-4 text-center">
            <span className="block text-3xl font-extrabold text-stone-800">
              {hoursData?.events_attended ?? 0}
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-stone-600">
              Events Attended
            </span>
          </div>
          <div className="col-span-2 sm:col-span-1 rounded-xl bg-stone-50 p-4 text-center">
            <span className="block text-3xl font-extrabold text-stone-800">
              {hoursData?.duties_attended ?? 0}
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-stone-600">
              Duties Completed
            </span>
          </div>
        </div>

        {hoursData?.records?.length > 0 && (
          <div className="mt-5 border-t pt-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-3">Verification History</h3>
            <ul className="divide-y divide-stone-100 text-sm">
              {hoursData.records.map((r, i) => (
                <li key={i} className="flex justify-between py-2">
                  <span>
                    <strong className="text-stone-800">{r.title}</strong>{' '}
                    <span className="text-xs text-stone-500 capitalize">({r.type})</span>
                  </span>
                  <span className="font-semibold text-emerald-800">{r.hours} hrs</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* 2. Profile & Interests */}
      <section className="card p-6">
        <h2 className="text-xl font-bold text-stone-900">Profile & Interests</h2>
        <p className="mt-1 text-sm text-stone-600">
          Your interests tailor recommendations and priority alerts for relevant volunteer opportunities.
        </p>
        <form onSubmit={handleProfileSave} className="mt-5 space-y-4">
          <div>
            <label htmlFor="student-name" className="label">Your Name</label>
            <input
              id="student-name"
              type="text"
              required
              className="input max-w-md"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Volunteering Interests</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {ALL_INTERESTS.map((cat) => {
                const active = selectedInterests.includes(cat)
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleInterest(cat)}
                    className={`badge px-4 py-2 text-sm font-semibold transition ${
                      active
                        ? 'bg-emerald-700 text-white'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                  >
                    {cat}
                  </button>
                )
              })}
            </div>
          </div>
          <button type="submit" disabled={profileSaving} className="btn-primary">
            {profileSaving ? 'Saving…' : 'Save Profile'}
          </button>
        </form>
      </section>

      {/* 3. Notifications Centre */}
      <section className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-emerald-700" />
            <h2 className="text-xl font-bold text-stone-900">Notifications</h2>
            {unreadCount > 0 && (
              <span className="badge bg-red-100 text-red-800 text-xs px-2 py-0.5">
                {unreadCount} unread
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={markAllNotificationsRead}
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1 inline" /> Mark all read
            </button>
          )}
        </div>

        {notifications.length ? (
          <ul className="space-y-3">
            {notifications.map((n) => (
              <li
                key={n.id}
                className={`rounded-xl border p-4 transition ${
                  n.read
                    ? 'border-stone-100 bg-stone-50/50 text-stone-600'
                    : 'border-emerald-200 bg-emerald-50/40 text-stone-900 shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold">{n.title}</h3>
                    <p className="mt-1 text-sm">{n.message}</p>
                    <span className="mt-2 block text-xs text-stone-400">
                      {n.created_at ? new Date(n.created_at).toLocaleString() : ''}
                    </span>
                  </div>
                  {!n.read && (
                    <button
                      type="button"
                      className="btn-secondary btn-sm shrink-0 text-xs"
                      onClick={() => markNotificationRead(n.id)}
                    >
                      Mark read
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-stone-500">No notifications yet.</p>
        )}
      </section>

      {/* 4. Recommendations */}
      <section className="card p-6">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-5 w-5 text-emerald-700" />
          <h2 className="text-xl font-bold text-stone-900">Recommended Opportunities</h2>
        </div>
        {recommendations.length ? (
          <ul className="mt-3 divide-y divide-stone-100">
            {recommendations.map((e) => (
              <li key={e.id} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <a className="font-bold text-emerald-800 hover:underline" href={`/events/${e.id}`}>
                    {e.title}
                  </a>
                  <p className="text-xs text-stone-500">{e.category} · {e.location}</p>
                </div>
                <span className="badge bg-stone-100 text-stone-700 text-xs">
                  {e.remaining_seats} seats left
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-stone-500">
            Recommendations appear as relevant upcoming events matching your interests become available.
          </p>
        )}
      </section>

      {/* 5. Become an Organizer / Organization Onboarding */}
      <section className="card p-6">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className="h-5 w-5 text-emerald-700" />
          <h2 className="text-xl font-bold text-stone-900">
            {(profile?.roles || []).includes('organizer') ? 'Organization setup' : 'Become an Organizer'}
          </h2>
        </div>
        <p className="text-sm text-stone-600 mb-5">
          Organization applications are verified by an administrator before events can be published.
        </p>

        {orgsLoading ? (
          <p className="text-sm text-stone-500">Checking your organization application…</p>
        ) : !hasActiveApplication && <form className="grid gap-4 sm:grid-cols-2" onSubmit={submitOrg}>
          <div>
            <label htmlFor="org-name" className="label">Organization Name</label>
            <input
              id="org-name"
              required
              minLength="2"
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="org-type" className="label">Organization Type</label>
            <input
              id="org-type"
              required
              className="input"
              value={form.organization_type}
              onChange={(e) => setForm({ ...form, organization_type: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="org-contact-name" className="label">Contact Name</label>
            <input
              id="org-contact-name"
              required
              className="input"
              value={form.contact_name}
              onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="org-contact-email" className="label">Contact Email</label>
            <input
              id="org-contact-email"
              required
              type="email"
              className="input"
              value={form.contact_email}
              onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="org-description" className="label">Description</label>
            <textarea
              id="org-description"
              required
              minLength="10"
              rows={3}
              className="input"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <button className="btn-primary" type="submit">
              Submit organization for approval
            </button>
          </div>
        </form>}

        {orgs.length > 0 && (
          <div className="mt-6 border-t pt-4">
            <h3 className="font-semibold text-stone-800 text-sm">Your Applications</h3>
            <div className="mt-2 space-y-2">
              {orgs.map((o) => (
                <div key={o.id} className="flex justify-between items-center rounded-lg bg-stone-50 p-3 text-sm">
                  <span className="font-medium text-stone-800">{o.name}</span>
                  <span className={`badge ${o.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : o.status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                    {o.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 6. Admin Panel (Admin-only) */}
      {(profile?.roles || []).includes('admin') && (
        <section className="card p-6 border-amber-300">
          <div className="flex items-center gap-2 mb-3">
            <span className="badge bg-amber-100 text-amber-800">Admin Only</span>
            <h2 className="text-xl font-bold text-stone-900">Pending Organization Applications</h2>
          </div>
          {pending.length ? (
            <div className="divide-y divide-stone-100">
              {pending.map((o) => (
                <div key={o.id} className="py-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-stone-900">{o.name}</h3>
                    <p className="text-sm text-stone-600">{o.organization_type} · {o.contact_email}</p>
                    <p className="mt-1 text-sm text-stone-500">{o.description}</p>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn-primary btn-sm" onClick={() => decide(o.id, 'approve')}>
                      Approve
                    </button>
                    <button className="btn-secondary btn-sm" onClick={() => decide(o.id, 'reject')}>
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-stone-500">No pending organization applications to review.</p>
          )}
        </section>
      )}
    </main>
  )
}
