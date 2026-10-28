import { Inbox } from 'lucide-react'

export default function EmptyState({ title, message, action, icon: Icon = Inbox }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-14 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <h3 className="text-base font-bold text-stone-900">{title}</h3>
      {message && <p className="mt-1.5 max-w-md text-sm text-stone-500">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
