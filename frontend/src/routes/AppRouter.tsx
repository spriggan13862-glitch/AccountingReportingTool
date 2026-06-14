import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
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
import { GeneralLedgerImportPage } from '@/pages/GeneralLedgerImportPage'
import { JournalEntryImportPage } from '@/pages/JournalEntryImportPage'
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
import { ConsolidationsPage } from '@/pages/ConsolidationsPage'
import { TrialBalancesPage } from '@/pages/TrialBalancesPage'
import { FinancialStatementsPage } from '@/pages/FinancialStatementsPage'
import { FinancialImpactWorkspacePage } from '@/pages/FinancialImpactWorkspacePage'
import { DeliverablesWorkspacePage } from '@/pages/DeliverablesWorkspacePage'
import { ReportBuilderPage } from '@/pages/ReportBuilderPage'
import { ImportCenterPage } from '@/pages/ImportCenterPage'
import { ImportWizardPage } from '@/pages/ImportWizardPage'
import { ImportReviewPage } from '@/pages/ImportReviewPage'
import { MappingWorkbenchPage } from '@/pages/MappingWorkbenchPage'
import { CloseDashboardPage } from '@/pages/CloseDashboardPage'
import { CloseChecklistPage } from '@/pages/CloseChecklistPage'
import { CloseTaskDetailPage } from '@/pages/CloseTaskDetailPage'
import { WorkpaperCenterPage } from '@/pages/WorkpaperCenterPage'
import { WorkpaperDetailPage } from '@/pages/WorkpaperDetailPage'
import { ComparativeFinancialsPage } from '@/pages/ComparativeFinancialsPage'
import { VarianceAnalysisPage } from '@/pages/VarianceAnalysisPage'
import { HelpCenterPage } from '@/pages/HelpCenterPage'
import { AdminPage } from '@/pages/AdminPage'
import { COAImportPage } from '@/pages/COAImportPage'
import { PDFImportPage } from '@/pages/PDFImportPage'
import { ChartOfAccountsPage } from '@/pages/ChartOfAccountsPage'
import { TaxonomyAdminPage } from '@/pages/TaxonomyAdminPage'
import { ReportingSettingsPage } from '@/pages/ReportingSettingsPage'
import { FSBuilderPage } from '@/pages/FSBuilderPage'
import { AdjustmentBridgePage } from '@/pages/AdjustmentBridgePage'
import { AdjustmentWorkspacePage } from '@/pages/AdjustmentWorkspacePage'
import { ReportingViewWorkspacePage } from '@/pages/ReportingViewWorkspacePage'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
import { ClientDataPage } from '@/pages/ClientDataPage'
import { QuarterlyReviewPage } from '@/pages/QuarterlyReviewPage'
import { IssueRepositoryPage } from '@/pages/IssueRepositoryPage'
import { FinancialDiagnosticsPage } from '@/pages/FinancialDiagnosticsPage'
import { RuleHarnessPage } from '@/pages/RuleHarnessPage'
import { ScenarioManagerPage } from '@/pages/ScenarioManagerPage'
import { AdvisoryAnalysisPage } from '@/pages/AdvisoryAnalysisPage'
import { ReviewWorkspacePage } from '@/pages/ReviewWorkspacePage'
import { OverviewPage } from '@/pages/OverviewPage'
import { AdjustmentsPage } from '@/pages/AdjustmentsPage'
import { SetupPage } from '@/pages/SetupPage'
import { QuickBooksConnectPage } from '@/pages/QuickBooksConnectPage'
import { QuickBooksCallbackPage } from '@/pages/QuickBooksCallbackPage'

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
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />

        {/* Protected application — all child routes require authentication */}
        <Route element={<AuthedShell />}>

          {/* ── ROOT ──────────────────────────────────────────────────────── */}
          <Route index element={<Navigate replace to="/overview" />} />
          <Route path="dashboard" element={<Navigate replace to="/overview" />} />

          {/* ── OVERVIEW ──────────────────────────────────────────────────── */}
          <Route path="overview" element={<OverviewPage />} />

          {/* ── ENGAGEMENT OVERVIEW ───────────────────────────────────────── */}
          <Route path="engagement/dashboard" element={<DashboardPage />} />
          <Route path="engagement/getting-started" element={<PlaceholderPage title="Getting Started" />} />
          <Route path="engagement/status" element={<PlaceholderPage title="Engagement Status" />} />
          <Route path="engagement" element={<Navigate replace to="/overview" />} />

          {/* ── CLIENT DATA ───────────────────────────────────────────────── */}
          <Route path="client-data/imports" element={<ImportCenterPage />} />
          <Route path="client-data/imports/pdf" element={<PDFImportPage />} />
          <Route path="client-data/imports/coa" element={<COAImportPage />} />
          <Route path="client-data/imports/trial-balance" element={<TrialBalanceImportPage />} />
          <Route path="client-data/imports/general-ledger" element={<GeneralLedgerImportPage />} />
          <Route path="client-data/imports/journal-entries" element={<JournalEntryImportPage />} />
          <Route path="client-data/imports/generic" element={<ImportCenterPage />} />
          <Route path="client-data/imports/:id/mapping" element={<MappingWorkbenchPage />} />
          <Route path="client-data/imports/:id" element={<ImportReviewPage />} />
          <Route path="client-data/documents" element={<DocumentsPage />} />
          <Route path="client-data/chart-of-accounts" element={<ChartOfAccountsPage />} />
          <Route path="client-data/taxonomy-mapping" element={<TaxonomyAdminPage />} />
          <Route path="client-data/entities" element={<EntitiesPage />} />
          <Route path="client-data/periods/:id" element={<PeriodDetailPage />} />
          <Route path="client-data/periods" element={<PeriodsPage />} />
          <Route path="client-data" element={<ClientDataPage />} />

          {/* ── ADJUSTMENT WORKBENCH (legacy — redirect to /adjustments) ─────── */}
          <Route path="workbench/adjustment-bridge" element={<Navigate replace to="/adjustments" />} />
          <Route path="workbench/adjustment-workspace" element={<Navigate replace to="/adjustments" />} />
          <Route path="workbench/journal-entries/new" element={<JournalEntryCreatePage />} />
          <Route path="workbench/journal-entries/:id" element={<JournalEntryDetailPage />} />
          <Route path="workbench/journal-entries" element={<JournalEntriesPage />} />
          <Route path="workbench/draft-preview" element={<Navigate replace to="/adjustments" />} />
          <Route path="workbench/scenarios" element={<Navigate replace to="/setup?tab=scenarios" />} />
          <Route path="workbench/advisory-analysis" element={<Navigate replace to="/adjustments" />} />
          <Route path="workbench/eliminations" element={<ConsolidationsPage />} />
          <Route path="workbench/reclasses" element={<PlaceholderPage title="Reclasses" />} />
          <Route path="workbench/accruals" element={<PlaceholderPage title="Accruals" />} />
          <Route path="workbench" element={<Navigate replace to="/adjustments" />} />

          {/* ── REVIEW WORKSPACE ──────────────────────────────────────────── */}
          <Route path="review" element={<ReviewWorkspacePage />} />

          {/* ── ADJUSTMENTS WORKSPACE ─────────────────────────────────────── */}
          <Route path="adjustments" element={<AdjustmentsPage />} />

          {/* ── ACCOUNTING INTELLIGENCE (legacy — redirect to /review) ──────── */}
          <Route path="intelligence/quarterly-review" element={<Navigate replace to="/review" />} />
          <Route path="intelligence/issue-repository" element={<IssueRepositoryPage />} />
          <Route path="intelligence/financial-diagnostics" element={<Navigate replace to="/review" />} />
          <Route path="intelligence/rule-harness" element={<RuleHarnessPage />} />
          <Route path="intelligence" element={<Navigate replace to="/review" />} />

          {/* ── FINANCIAL IMPACT (legacy — redirect to /review) ───────────── */}
          <Route path="financial-impact/trial-balance" element={<TrialBalancesPage />} />
          <Route path="financial-impact/statements" element={<FinancialStatementsPage />} />
          <Route path="financial-impact/builder" element={<FSBuilderPage />} />
          <Route path="financial-impact/comparatives" element={<ComparativeFinancialsPage />} />
          <Route path="financial-impact/variance" element={<Navigate replace to="/review" />} />
          <Route path="financial-impact/balance-sheet" element={<PlaceholderPage title="Balance Sheet" />} />
          <Route path="financial-impact/income-statement" element={<PlaceholderPage title="Income Statement" />} />
          <Route path="financial-impact/cash-flow" element={<PlaceholderPage title="Cash Flow" />} />
          <Route path="financial-impact" element={<Navigate replace to="/review" />} />

          {/* ── DELIVERABLES ──────────────────────────────────────────────── */}
          <Route path="deliverables/workspace" element={<DeliverablesWorkspacePage />} />
          <Route path="deliverables/close-package/tasks/:id" element={<CloseTaskDetailPage />} />
          <Route path="deliverables/close-package/:id" element={<CloseChecklistPage />} />
          <Route path="deliverables/close-package" element={<CloseDashboardPage />} />
          <Route path="deliverables/workpapers/:id" element={<WorkpaperDetailPage />} />
          <Route path="deliverables/workpapers" element={<WorkpaperCenterPage />} />
          <Route path="deliverables/reconciliations/:id" element={<ReconciliationDetailPage />} />
          <Route path="deliverables/reconciliations" element={<ReconciliationPage />} />
          <Route path="deliverables/report-builder" element={<ReportBuilderPage />} />
          <Route path="deliverables/reports/:id" element={<ReportDetailPage />} />
          <Route path="deliverables/reports" element={<ReportsPage />} />
          <Route path="deliverables/je-export" element={<PlaceholderPage title="JE Export" />} />
          <Route path="deliverables/advisor-report" element={<PlaceholderPage title="Advisor Report" />} />
          <Route path="deliverables/audit-support" element={<PlaceholderPage title="Audit Support Package" />} />
          <Route path="deliverables" element={<Navigate replace to="/deliverables/close-package" />} />

          {/* ── SETUP ─────────────────────────────────────────────────────── */}
          <Route path="setup" element={<SetupPage />} />
          <Route path="setup/reporting-views" element={<Navigate replace to="/setup?tab=reporting-views" />} />
          <Route path="setup/settings" element={<Navigate replace to="/setup?tab=settings" />} />
          <Route path="setup/help" element={<HelpCenterPage />} />
          <Route path="setup/taxonomy-admin" element={<Navigate replace to="/setup?tab=taxonomy" />} />

          {/* ── QUICKBOOKS ────────────────────────────────────────────────── */}
          <Route path="quickbooks/connect" element={<QuickBooksConnectPage />} />

        </Route>

        {/* QuickBooks OAuth callback — outside AuthedShell so it works during redirect */}
        <Route path="/quickbooks/callback" element={<QuickBooksCallbackPage />} />

        <Route element={<AuthedShell />}>

          {/* ── ADMIN (role-gated) ────────────────────────────────────────── */}
          <Route
            path="admin"
            element={
              <ProtectedRoute requiredRole="admin">
                <AdminPage />
              </ProtectedRoute>
            }
          />

          {/* ── DEFERRED FEATURES ─────────────────────────────────────────── */}
          <Route path="workflow" element={<WorkflowPage />} />
          <Route path="issues" element={<IssuesPage />} />

          {/* ── LEGACY REDIRECTS — old routes → new canonical paths ────────── */}
          {/* Routes with query strings kept as direct routes (not redirects) */}
          <Route path="pdf-import" element={<PDFImportPage />} />
          <Route path="coa-import" element={<COAImportPage />} />
          <Route path="import/new" element={<ImportWizardPage />} />
          <Route path="import/:id/mapping" element={<MappingWorkbenchPage />} />
          <Route path="import/:id" element={<ImportReviewPage />} />
          <Route path="import" element={<Navigate replace to="/client-data/imports" />} />
          <Route path="import-center" element={<Navigate replace to="/client-data/imports" />} />
          <Route path="imports/trial-balance" element={<Navigate replace to="/client-data/imports/trial-balance" />} />
          <Route path="imports/general-ledger" element={<Navigate replace to="/client-data/imports/general-ledger" />} />
          <Route path="imports/journal-entries" element={<Navigate replace to="/client-data/imports/journal-entries" />} />
          <Route path="trial-balance-import" element={<TrialBalanceImportPage />} />
          <Route path="documents" element={<Navigate replace to="/client-data/documents" />} />
          <Route path="accounts" element={<Navigate replace to="/client-data/chart-of-accounts" />} />
          <Route path="chart-of-accounts" element={<Navigate replace to="/client-data/chart-of-accounts" />} />
          <Route path="taxonomy-admin" element={<Navigate replace to="/client-data/taxonomy-mapping" />} />
          <Route path="entities" element={<Navigate replace to="/client-data/entities" />} />
          <Route path="periods/:id" element={<PeriodDetailPage />} />
          <Route path="periods" element={<Navigate replace to="/client-data/periods" />} />
          <Route path="adjustment-bridge" element={<Navigate replace to="/workbench/adjustment-bridge" />} />
          <Route path="journal-entries/new" element={<JournalEntryCreatePage />} />
          <Route path="journal-entries/:id" element={<JournalEntryDetailPage />} />
          <Route path="journal-entries" element={<Navigate replace to="/workbench/journal-entries" />} />
          <Route path="draft-preview" element={<Navigate replace to="/workbench/draft-preview" />} />
          <Route path="consolidations" element={<Navigate replace to="/workbench/eliminations" />} />
          <Route path="trial-balances" element={<Navigate replace to="/financial-impact/trial-balance" />} />
          <Route path="financial-statements" element={<Navigate replace to="/financial-impact/statements" />} />
          <Route path="fs-builder" element={<Navigate replace to="/financial-impact/builder" />} />
          <Route path="comparative-financials" element={<Navigate replace to="/financial-impact/comparatives" />} />
          <Route path="variance-analysis" element={<Navigate replace to="/financial-impact/variance" />} />
          <Route path="close/tasks/:id" element={<CloseTaskDetailPage />} />
          <Route path="close/workpapers/:id" element={<WorkpaperDetailPage />} />
          <Route path="close/workpapers" element={<Navigate replace to="/deliverables/workpapers" />} />
          <Route path="close/:id" element={<CloseChecklistPage />} />
          <Route path="close" element={<Navigate replace to="/deliverables/close-package" />} />
          <Route path="reconciliations/:id" element={<ReconciliationDetailPage />} />
          <Route path="reconciliations" element={<Navigate replace to="/deliverables/reconciliations" />} />
          <Route path="report-builder" element={<Navigate replace to="/deliverables/report-builder" />} />
          <Route path="reports/:id" element={<ReportDetailPage />} />
          <Route path="reports" element={<Navigate replace to="/deliverables/reports" />} />
          <Route path="reporting-taxonomy" element={<Navigate replace to="/client-data/taxonomy-mapping" />} />
          <Route path="reporting-settings" element={<Navigate replace to="/setup/settings" />} />
          <Route path="help" element={<Navigate replace to="/setup/help" />} />

        </Route>
      </Routes>
    </BrowserRouter>
  )
}
