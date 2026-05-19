import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/providers/AuthProvider'
import { OrgProvider, useOrg } from '@/providers/OrgProvider'
import { ToastProvider } from '@/providers/ToastProvider'
import { AppRouter } from '@/routes/AppRouter'
import { useAuth } from '@/providers/AuthProvider'
import { getOrganization } from '@/api/organizations'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
})

// Automatically loads the authenticated user's organization into OrgProvider.
function OrgAutoLoader({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth()
  const { org, setOrg } = useOrg()

  useEffect(() => {
    if (!isAuthenticated || !user) return
    if (org?.id === user.organization_id) return
    getOrganization(user.organization_id)
      .then(setOrg)
      .catch(() => {})
  }, [isAuthenticated, user, org, setOrg])

  return <>{children}</>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <OrgProvider>
          <ToastProvider>
            <OrgAutoLoader>
              <AppRouter />
            </OrgAutoLoader>
          </ToastProvider>
        </OrgProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
