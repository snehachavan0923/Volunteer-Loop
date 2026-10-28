import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
import { IdentityProvider, useIdentity } from './context/IdentityContext'
import Navbar from './components/Navbar'
import EmptyState from './components/EmptyState'
import Home from './pages/Home'
import EventDetails from './pages/EventDetails'
import MyRegistrations from './pages/MyRegistrations'
import Organizer from './pages/Organizer'
import Account from './pages/Account'
import AuthPage from './pages/AuthPage'
import AdminDashboard from './pages/AdminDashboard'

function NotFound() {
  return <div className="mx-auto max-w-2xl px-4 py-16"><EmptyState title="Page not found" message="That page doesn't exist." action={<Link to="/" className="btn-primary">Back to events</Link>} /></div>
}

function AdminRoute() {
  const { identity, isAuthenticated, isLoading } = useIdentity()
  if (isLoading) return <div className="mx-auto max-w-3xl px-4 py-16 text-center text-stone-500">Checking your session…</div>
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (!identity?.roles?.includes('admin')) return <Navigate to={identity?.roles?.includes('organizer') ? '/organizer' : '/student-dashboard'} replace />
  return <AdminDashboard />
}

export default function App() {
  return <BrowserRouter><IdentityProvider><div className="flex min-h-screen flex-col"><Navbar /><main className="flex-1"><Routes>
    <Route path="/" element={<Home />} />
    <Route path="/login" element={<AuthPage mode="login" />} />
    <Route path="/signup" element={<AuthPage mode="signup" />} />
    <Route path="/events/:eventId" element={<EventDetails />} />
    <Route path="/my-registrations" element={<MyRegistrations />} />
    <Route path="/student-dashboard" element={<MyRegistrations />} />
    <Route path="/organizer" element={<Organizer />} />
    <Route path="/admin" element={<AdminRoute />} />
    <Route path="/account" element={<Account />} />
    <Route path="*" element={<NotFound />} />
  </Routes></main><footer className="border-t border-stone-200 bg-white py-5 text-center text-xs text-stone-500">VolunteerLoop · community volunteering platform</footer></div></IdentityProvider></BrowserRouter>
}
