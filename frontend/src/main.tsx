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
import { DraftsPage } from './pages/Drafts/DraftsPage'
import { EditorPage } from './pages/Editor/EditorPage'
import { LoginPage } from './pages/Login/LoginPage'
import { Placeholder } from './pages/Placeholder/Placeholder'
import { ProfilePage } from './pages/Profile/ProfilePage'
import { StatusPage } from './pages/Status/StatusPage'
import { TodayPage } from './pages/Today/TodayPage'
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
      { path: '/', element: <TodayPage /> },
      { path: '/import', element: <UploadPage /> },
      { path: '/drafts', element: <DraftsPage /> },
      { path: '/drafts/:id', element: <EditorPage /> },
      { path: '/calendar', element: <Placeholder title="Calendar" when="Phase 5" /> },
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
