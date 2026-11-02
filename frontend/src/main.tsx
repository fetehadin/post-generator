import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import { AppShell } from './components/AppShell'
import { AuthGate } from './components/AuthGate'
// Self-hosted fonts (no third-party requests from user pages). Archivo for the interface;
// Source Serif 4 for the user's writing; Noto Ethiopic so Amharic renders in both.
import '@fontsource/archivo/400.css'
import '@fontsource/archivo/600.css'
import '@fontsource/noto-sans-ethiopic/400.css'
import '@fontsource/noto-sans-ethiopic/600.css'
import '@fontsource/noto-serif-ethiopic/400.css'
import '@fontsource/source-serif-4/400.css'
import '@fontsource/source-serif-4/600.css'
import './index.css'
import { applyTheme, savedTheme } from './lib/theme'
import { CalendarPage } from './pages/Calendar/CalendarPage'
import { CheckinsPage } from './pages/Checkins/CheckinsPage'
import { DraftRedirect } from './pages/Chat/DraftRedirect'
import { NewChatPage } from './pages/Chat/NewChatPage'
import { ThreadPage } from './pages/Chat/ThreadPage'
import { DraftsPage } from './pages/Drafts/DraftsPage'
import { LoginPage } from './pages/Login/LoginPage'
import { ProfilePage } from './pages/Profile/ProfilePage'
import { StatusPage } from './pages/Status/StatusPage'
import { UploadPage } from './pages/Upload/UploadPage'

applyTheme(savedTheme())

const queryClient = new QueryClient()

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: (
      <AuthGate>
        <AppShell />
      </AuthGate>
    ),
    children: [
      { path: '/', element: <NewChatPage /> },
      { path: '/import', element: <UploadPage /> },
      { path: '/chat/:id', element: <ThreadPage /> },
      { path: '/checkins', element: <CheckinsPage /> },
      { path: '/drafts', element: <Navigate to="/drafts/x" replace /> },
      { path: '/drafts/x', element: <DraftsPage platform="x" /> },
      { path: '/drafts/linkedin', element: <DraftsPage platform="linkedin" /> },
      { path: '/drafts/telegram', element: <DraftsPage platform="telegram" /> },
      { path: '/drafts/:id', element: <DraftRedirect /> },
      { path: '/calendar', element: <CalendarPage /> },
      { path: '/profile', element: <ProfilePage /> },
      { path: '/voice', element: <Navigate to="/profile" replace /> },
      { path: '/status', element: <StatusPage /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
