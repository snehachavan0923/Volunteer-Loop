import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, RefreshCw, ShieldCheck, XCircle } from 'lucide-react'
import { api } from '../services/api'

function displayDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString()
}

export default function AdminDashboard() {
  const [organizations, setOrganizations] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setOrganizations(await api.listPendingOrganizations()) }
    catch (e) { setError(e.message || 'Could not load pending organizations.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  async function decide(org, decision) {
    const action = decision === 'approve' ? 'approve' : 'reject'
    const verb = action === 'approve' ? 'approve' : 'reject'
    if (!window.confirm(`Are you sure you want to ${verb} “${org.name}”?`)) return
    setBusyId(org.id); setError(''); setNotice('')
    try {
      await api.decideOrganization(org.id, action)
      setOrganizations((items) => items.filter((item) => item.id !== org.id))
      setNotice(`“${org.name}” was ${action === 'approve' ? 'approved' : 'rejected'}.`)
    } catch (e) { setError(e.message || `Could not ${verb} this organization.`) }
    finally { setBusyId('') }
  }
  return <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-sm font-semibold text-emerald-800"><ShieldCheck className="h-5 w-5" /> ADMINISTRATION</div><h1 className="mt-2 text-3xl font-extrabold tracking-tight text-stone-900">Admin dashboard</h1><p className="mt-2 max-w-2xl text-stone-600">Review organization applications. Approved organizations can publish and manage volunteering events.</p></div><button type="button" onClick={load} disabled={loading} className="btn-secondary inline-flex items-center gap-2"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button></div>
    {error && <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}{notice && <p role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}
    <div className="mt-8 flex items-center justify-between"><h2 className="text-xl font-bold text-stone-900">Pending applications</h2><span className="rounded-full bg-stone-100 px-3 py-1 text-sm font-semibold text-stone-700">{organizations.length}</span></div>
    {loading ? <div className="card mt-4 p-8 text-center text-stone-500">Loading organization applications…</div> : organizations.length === 0 ? <div className="card mt-4 p-10 text-center"><CheckCircle2 className="mx-auto h-10 w-10 text-emerald-700" /><h3 className="mt-3 text-lg font-bold text-stone-900">No pending applications</h3><p className="mt-1 text-sm text-stone-500">New organization applications will appear here.</p></div> : <div className="mt-4 grid gap-4">{organizations.map((org) => <article key={org.id} className="card p-5 sm:p-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-bold text-stone-900">{org.name || 'Unnamed organization'}</h3><span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">Pending</span></div><p className="mt-1 text-sm text-stone-500">{org.organization_type || 'Organization type not specified'} · Submitted {displayDate(org.created_at)}</p>{org.description && <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-stone-700">{org.description}</p>}<dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2"><div><dt className="font-semibold text-stone-500">Contact person</dt><dd className="mt-0.5 text-stone-800">{org.contact_name || '—'}</dd></div><div><dt className="font-semibold text-stone-500">Contact email</dt><dd className="mt-0.5 break-all text-stone-800">{org.contact_email || '—'}</dd></div></dl></div><div className="flex shrink-0 gap-2"><button type="button" disabled={Boolean(busyId)} onClick={() => decide(org, 'reject')} className="btn-secondary inline-flex items-center gap-2 disabled:opacity-50"><XCircle className="h-4 w-4" /> Reject</button><button type="button" disabled={Boolean(busyId)} onClick={() => decide(org, 'approve')} className="btn-primary inline-flex items-center gap-2 disabled:opacity-50">{busyId === org.id ? 'Saving…' : <><CheckCircle2 className="h-4 w-4" /> Approve</>}</button></div></div></article>)}</div>}
  </section>
}
