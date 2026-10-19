import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { AppShell } from './components/AppShell'
import './index.css'
import { applyTheme, savedTheme } from './lib/theme'
import { Placeholder } from './pages/Placeholder/Placeholder'
import { StatusPage } from './pages/Status/StatusPage'
import { UploadPage } from './pages/Upload/UploadPage'

applyTheme(savedTheme())

const queryClient = new QueryClient()

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      {
        path: '/',
        element: <Placeholder title="Today" when="the next step, once its features are decided" />,
      },
      { path: '/import', element: <UploadPage /> },
      { path: '/drafts', element: <Placeholder title="Drafts" when="Phase 4" /> },
      { path: '/calendar', element: <Placeholder title="Calendar" when="Phase 5" /> },
      { path: '/voice', element: <Placeholder title="Voice" when="Phase 3" /> },
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
