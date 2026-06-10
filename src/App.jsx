import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Navbar from './components/Navbar'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import MatchesPage from './pages/MatchesPage'
import LeaderboardPage from './pages/LeaderboardPage'
import LeaguesPage from './pages/LeaguesPage'
import LeaguePage from './pages/LeaguePage'
import AdminPage from './pages/AdminPage'
import BracketPage from './pages/BracketPage'
import AuthCallbackPage from './pages/AuthCallbackPage'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading…</div>
  if (user) return <Navigate to="/matches" replace />
  return children
}

function Layout({ children }) {
  return (
    <>
      <Navbar />
      <main>{children}</main>
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
          <Route path="/matches" element={<PrivateRoute><Layout><MatchesPage /></Layout></PrivateRoute>} />
          <Route path="/leagues" element={<PrivateRoute><Layout><LeaguesPage /></Layout></PrivateRoute>} />
          <Route path="/leagues/:id" element={<PrivateRoute><Layout><LeaguePage /></Layout></PrivateRoute>} />
          <Route path="/leaderboard" element={<PrivateRoute><Layout><LeaderboardPage /></Layout></PrivateRoute>} />
          <Route path="/bracket" element={<PrivateRoute><Layout><BracketPage /></Layout></PrivateRoute>} />
          <Route path="/admin" element={<PrivateRoute><Layout><AdminPage /></Layout></PrivateRoute>} />
          <Route path="*" element={<Navigate to="/matches" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
