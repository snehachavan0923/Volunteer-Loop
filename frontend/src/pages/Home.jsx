import { useCallback, useEffect, useState } from 'react'
import { Search, SearchX } from 'lucide-react'
import { api } from '../services/api'
import EventCard from '../components/EventCard'
import LoadingState from '../components/LoadingState'
import EmptyState from '../components/EmptyState'
import ErrorMessage from '../components/ErrorMessage'

export default function Home() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [category, setCategory] = useState('')
  const [categories, setCategories] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  // Wait for the person to stop typing before asking the server.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    let ignore = false
    setLoading(true)
    setError('')
    Promise.all([
      api.listEvents({ q: debouncedSearch, category }),
      api.listCategories(),
    ])
      .then(([list, cats]) => {
        if (ignore) return
        setEvents(list)
        setCategories(cats)
      })
      .catch((err) => !ignore && setError(err.message))
      .finally(() => !ignore && setLoading(false))
    return () => {
      ignore = true
    }
  }, [debouncedSearch, category, reloadKey])

  const retry = useCallback(() => setReloadKey((k) => k + 1), [])
  const filtering = Boolean(debouncedSearch || category)

  function clearFilters() {
    setSearch('')
    setDebouncedSearch('')
    setCategory('')
  }

  return (
    <>
      <section className="border-b border-emerald-900/10 bg-gradient-to-br from-emerald-800 via-emerald-700 to-teal-700 text-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <h1 className="max-w-2xl text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
            Find a cause. Pick a duty. Show up.
          </h1>
          <p className="mt-3 max-w-xl text-emerald-50/90">
            Browse volunteering events at your college, grab a seat, and sign up for the specific
            duty you want to help with.
          </p>

          <div className="mt-8 max-w-xl">
            <label htmlFor="event-search" className="sr-only">
              Search events
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
                aria-hidden="true"
              />
              <input
                id="event-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by title, place or organizer"
                className="input pl-10 text-stone-900"
              />
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center gap-2" role="group" aria-label="Filter by category">
          <button
            type="button"
            onClick={() => setCategory('')}
            aria-pressed={category === ''}
            className={`badge px-4 py-2 text-sm transition ${category === '' ? 'bg-emerald-700 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100'}`}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={`badge px-4 py-2 text-sm transition ${category === c ? 'bg-emerald-700 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100'}`}
            >
              {c}
            </button>
          ))}
        </div>

        {error ? (
          <ErrorMessage message={error} onRetry={retry} />
        ) : loading ? (
          <LoadingState label="Loading events…" />
        ) : events.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title={filtering ? 'No events match your search' : 'No upcoming events yet'}
            message={
              filtering
                ? 'Try a different word or clear the filters.'
                : 'Organizers can publish events from the Organizer page. Check back soon!'
            }
            action={
              filtering && (
                <button type="button" className="btn-secondary" onClick={clearFilters}>
                  Clear filters
                </button>
              )
            }
          />
        ) : (
          <>
            <p className="mb-4 text-sm text-stone-500" aria-live="polite">
              {events.length} upcoming {events.length === 1 ? 'event' : 'events'}
            </p>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {events.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}
