import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppShell } from '@/layouts/AppShell'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { LoginPage } from '@/pages/LoginPage'
import { UnauthorizedPage } from '@/pages/UnauthorizedPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { EntitiesPage } from '@/pages/EntitiesPage'
import { JournalEntriesPage } from '@/pages/JournalEntriesPage'
import { JournalEntryDetailPage } from '@/pages/JournalEntryDetailPage'
import { JournalEntryCreatePage } from '@/pages/JournalEntryCreatePage'
import { TrialBalanceImportPage } from '@/pages/TrialBalanceImportPage'
import { PeriodsPage } from '@/pages/PeriodsPage'
import { PeriodDetailPage } from '@/pages/PeriodDetailPage'
import { ReportsPage } from '@/pages/ReportsPage'
import { ReportDetailPage } from '@/pages/ReportDetailPage'
import { WorkflowPage } from '@/pages/WorkflowPage'
import { IssuesPage } from '@/pages/IssuesPage'
import { DocumentsPage } from '@/pages/DocumentsPage'
import { DraftPreviewPage } from '@/pages/DraftPreviewPage'
import { ReconciliationPage } from '@/pages/ReconciliationPage'
import { ReconciliationDetailPage } from '@/pages/ReconciliationDetailPage'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
import { FinancialStatementsPage } from '@/pages/FinancialStatementsPage'
import { ReportBuilderPage } from '@/pages/ReportBuilderPage'
import { ImportCenterPage } from '@/pages/ImportCenterPage'
import { ImportReviewPage } from '@/pages/ImportReviewPage'
import { MappingWorkbenchPage } from '@/pages/MappingWorkbenchPage'
import { CloseDashboardPage } from '@/pages/CloseDashboardPage'
import { CloseChecklistPage } from '@/pages/CloseChecklistPage'
import { CloseTaskDetailPage } from '@/pages/CloseTaskDetailPage'
import { WorkpaperCenterPage } from '@/pages/WorkpaperCenterPage'
import { WorkpaperDetailPage } from '@/pages/WorkpaperDetailPage'
import { ComparativeFinancialsPage } from '@/pages/ComparativeFinancialsPage'
import { VarianceAnalysisPage } from '@/pages/VarianceAnalysisPage'

/**
 * Auth-guarded shell — renders ProtectedRoute, then AppShell as layout.
 * React Router requires the layout route element to render <Outlet />,
 * so AppShell lives inside a ProtectedRoute wrapper.
 */
function AuthedShell() {
  return (
    <ProtectedRoute>
      <AppShell />
    </ProtectedRoute>
  )
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes — no auth required */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />

        {/* Protected application — all child routes require authentication */}
        <Route element={<AuthedShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="entities" element={<EntitiesPage />} />
          <Route path="journal-entries" element={<JournalEntriesPage />} />
          <Route path="journal-entries/new" element={<JournalEntryCreatePage />} />
          <Route path="journal-entries/:id" element={<JournalEntryDetailPage />} />
          <Route path="trial-balance-import" element={<TrialBalanceImportPage />} />
          <Route path="import" element={<ImportCenterPage />} />
          <Route path="import/:id" element={<ImportReviewPage />} />
          <Route path="import/:id/mapping" element={<MappingWorkbenchPage />} />
          <Route path="periods" element={<PeriodsPage />} />
          <Route path="periods/:id" element={<PeriodDetailPage />} />
          <Route path="draft-preview" element={<DraftPreviewPage />} />
          <Route path="reconciliations" element={<ReconciliationPage />} />
          <Route path="reconciliations/:id" element={<ReconciliationDetailPage />} />
          <Route path="trial-balances" element={<PlaceholderPage title="Trial Balances" />} />
          <Route path="financial-statements" element={<FinancialStatementsPage />} />
          <Route path="report-builder" element={<ReportBuilderPage />} />
          <Route path="consolidations" element={<PlaceholderPage title="Consolidations" />} />
          <Route path="workflow" element={<WorkflowPage />} />
          <Route path="issues" element={<IssuesPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="reports/:id" element={<ReportDetailPage />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="close" element={<CloseDashboardPage />} />
          <Route path="close/:id" element={<CloseChecklistPage />} />
          <Route path="close/tasks/:id" element={<CloseTaskDetailPage />} />
          <Route path="close/workpapers" element={<WorkpaperCenterPage />} />
          <Route path="close/workpapers/:id" element={<WorkpaperDetailPage />} />
          <Route path="comparative-financials" element={<ComparativeFinancialsPage />} />
          <Route path="variance-analysis" element={<VarianceAnalysisPage />} />
          {/* Admin route — requires admin role */}
          <Route
            path="admin"
            element={
              <ProtectedRoute requiredRole="admin">
                <PlaceholderPage title="Admin" />
              </ProtectedRoute>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
