import { Link } from 'react-router-dom'
import { formatDateTime } from '../utils/format'
import CapacityBar from './CapacityBar'
import { CalendarDays, MapPin, UserRound, ArrowRight } from 'lucide-react'

export default function EventCard({ event }) {
  const full = event.remaining_seats === 0
  return (
    <article className="card flex h-full flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="badge bg-emerald-50 text-emerald-800">{event.category}</span>
        {full && <span className="badge bg-red-50 text-red-700">Full</span>}
      </div>
      <h3 className="text-lg font-bold leading-snug text-stone-900">{event.title}</h3>
      <p className="mt-1.5 line-clamp-2 text-sm text-stone-600">{event.description}</p>

      <ul className="mt-4 space-y-2 text-sm text-stone-600">
        <li className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
          {formatDateTime(event.event_date)}
        </li>
        <li className="flex items-center gap-2">
          <MapPin className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
          {event.location}
        </li>
        <li className="flex items-center gap-2">
          <UserRound className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
          Organized by {event.organizer_name}
        </li>
      </ul>

      <div className="mt-5">
        <CapacityBar used={event.registered_count} total={event.capacity} label="seats" />
      </div>

      <Link to={`/events/${event.id}`} className="btn-primary mt-5 w-full">
        View details <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </article>
  )
}
