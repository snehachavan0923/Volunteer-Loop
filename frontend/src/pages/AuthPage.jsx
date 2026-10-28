
import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  CalendarCheck,
  Eye,
  EyeOff,
  HeartHandshake,
  Users,
} from 'lucide-react'
import { useIdentity } from '../context/IdentityContext'

export default function AuthPage({ mode = 'login' }) {
  const { identity, isAuthenticated, isLoading, authenticate, register } =
    useIdentity()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('student')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const signup = mode === 'signup'

  if (isLoading) {
    return (
      <main className="mx-auto max-w-lg px-4 py-20 text-center text-stone-500">
        Checking your session…
      </main>
    )
  }

  if (isAuthenticated && identity) {
    return (
      <Navigate
        to={
          identity.roles?.includes('admin')
            ? '/admin'
            : identity.roles?.includes('organizer')
              ? '/organizer'
              : '/student-dashboard'
        }
        replace
      />
    )
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    setBusy(true)

    try {
      const user = signup
        ? await register({
            name: name.trim(),
            email: email.trim(),
            password,
            role,
          })
        : await authenticate({
            email: email.trim(),
            password,
          })

      const roles = user?.roles || ['student']

      navigate(
        roles.includes('admin')
          ? '/admin'
          : roles.includes('organizer')
            ? '/organizer'
            : '/student-dashboard',
        { replace: true },
      )
    } catch (e) {
      setError(
        e.message ||
          (signup ? 'Unable to create your account.' : 'Unable to sign in.'),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto grid max-w-5xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_0.9fr] lg:py-16">
      <section className="flex flex-col justify-center">
        <Link
          to="/"
          className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-emerald-800"
        >
          <HeartHandshake className="h-5 w-5" />
          VolunteerLoop
        </Link>

        <span className="badge w-fit bg-emerald-100 text-emerald-800">
          {signup ? 'Join the community' : 'Welcome back'}
        </span>

        <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-stone-900">
          {signup
            ? 'Make a difference together.'
            : 'Your next good thing starts here.'}
        </h1>

        <p className="mt-4 max-w-xl text-base leading-7 text-stone-600">
          {signup
            ? 'Create an account to discover volunteering opportunities or organize meaningful events for your community.'
            : 'Sign in to manage your volunteering, discover opportunities, or continue organizing your community events.'}
        </p>

        <div className="mt-8 space-y-4">
          <div className="flex gap-3">
            <CalendarCheck className="mt-1 h-5 w-5 shrink-0 text-emerald-700" />
            <div>
              <p className="font-semibold text-stone-800">Find opportunities</p>
              <p className="text-sm text-stone-500">
                Browse events and keep your registrations in one place.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <Users className="mt-1 h-5 w-5 shrink-0 text-emerald-700" />
            <div>
              <p className="font-semibold text-stone-800">Build community</p>
              <p className="text-sm text-stone-500">
                Organizers can manage events for their community.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="card p-6 sm:p-8">
        <h2 className="text-2xl font-bold text-stone-900">
          {signup ? 'Create your account' : 'Sign in to VolunteerLoop'}
        </h2>

        <p className="mt-2 text-sm text-stone-500">
          {signup
            ? 'Enter your details and choose your account type.'
            : 'Use the email and password you registered with.'}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          {signup && (
            <>
              <label className="block">
                <span className="label">Full name</span>
                <input
                  className="input mt-1"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your full name"
                  minLength={2}
                  maxLength={100}
                  required
                />
              </label>

              <fieldset className="space-y-3">
                <legend className="label mb-2">I want to join as a…</legend>

                <button
                  type="button"
                  onClick={() => setRole('student')}
                  className={`w-full rounded-xl border p-4 text-left transition ${
                    role === 'student'
                      ? 'border-emerald-700 bg-emerald-50 ring-1 ring-emerald-700'
                      : 'border-stone-200 hover:border-stone-400'
                  }`}
                >
                  <span className="flex items-center justify-between font-semibold text-stone-900">
                    Student / Volunteer
                    <span
                      className={`h-4 w-4 rounded-full border-4 ${
                        role === 'student'
                          ? 'border-emerald-700'
                          : 'border-stone-300'
                      }`}
                    />
                  </span>
                  <span className="mt-1 block text-sm text-stone-500">
                    Discover events, register, and track your volunteering.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setRole('organizer')}
                  className={`w-full rounded-xl border p-4 text-left transition ${
                    role === 'organizer'
                      ? 'border-emerald-700 bg-emerald-50 ring-1 ring-emerald-700'
                      : 'border-stone-200 hover:border-stone-400'
                  }`}
                >
                  <span className="flex items-center justify-between font-semibold text-stone-900">
                    Event Organizer
                    <span
                      className={`h-4 w-4 rounded-full border-4 ${
                        role === 'organizer'
                          ? 'border-emerald-700'
                          : 'border-stone-300'
                      }`}
                    />
                  </span>
                  <span className="mt-1 block text-sm text-stone-500">
                    Create and manage volunteering events.
                  </span>
                </button>
              </fieldset>
            </>
          )}

          <label className="block">
            <span className="label">Email address</span>
            <input
              className="input mt-1"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </label>

          <label className="block">
            <span className="label">Password</span>

            <div className="relative mt-1">
              <input
                className="input w-full pr-11"
                type={showPassword ? 'text' : 'password'}
                autoComplete={signup ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  signup ? 'At least 8 characters' : 'Enter your password'
                }
                minLength={signup ? 8 : 1}
                required
              />

              <button
                type="button"
                onClick={() => setShowPassword((previous) => !previous)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-stone-500 hover:text-stone-800"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Eye className="h-5 w-5" aria-hidden="true" />
                )}
              </button>
            </div>
          </label>

          {error && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? 'Please wait…' : signup ? 'Create account' : 'Log in'}
            {!busy && <ArrowRight className="h-4 w-4" />}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-stone-600">
          {signup ? 'Already have an account?' : "Don't have an account?"}{' '}
          <Link
            className="font-semibold text-emerald-800 hover:underline"
            to={signup ? '/login' : '/signup'}
          >
            {signup ? 'Log in' : 'Sign up'}
          </Link>
        </p>

        <p className="mt-5 text-xs leading-5 text-stone-400">
          Local development authentication is enabled. Use a unique email
          address and keep your password private.
        </p>
      </section>
    </main>
  )
}
