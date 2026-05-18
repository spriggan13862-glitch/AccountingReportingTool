import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppShell } from '@/layouts/AppShell'
import { DashboardPage } from '@/pages/DashboardPage'
import { EntitiesPage } from '@/pages/EntitiesPage'
import { JournalEntriesPage } from '@/pages/JournalEntriesPage'
import { JournalEntryDetailPage } from '@/pages/JournalEntryDetailPage'
import { ReportsPage } from '@/pages/ReportsPage'
import { ReportDetailPage } from '@/pages/ReportDetailPage'
import { WorkflowPage } from '@/pages/WorkflowPage'
import { IssuesPage } from '@/pages/IssuesPage'
import { DocumentsPage } from '@/pages/DocumentsPage'
import { PlaceholderPage } from '@/pages/PlaceholderPage'

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="entities" element={<EntitiesPage />} />
          <Route path="journal-entries" element={<JournalEntriesPage />} />
          <Route path="journal-entries/:id" element={<JournalEntryDetailPage />} />
          <Route path="trial-balances" element={<PlaceholderPage title="Trial Balances" />} />
          <Route path="financial-statements" element={<PlaceholderPage title="Financial Statements" />} />
          <Route path="consolidations" element={<PlaceholderPage title="Consolidations" />} />
          <Route path="workflow" element={<WorkflowPage />} />
          <Route path="issues" element={<IssuesPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="reports/:id" element={<ReportDetailPage />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="admin" element={<PlaceholderPage title="Admin" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
