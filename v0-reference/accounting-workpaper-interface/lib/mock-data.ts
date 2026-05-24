// Mock data for Ledger Advisory accounting workpaper application

export const clients = [
  { id: "1", name: "Sunrise Coffee Co.", industry: "F&B" },
  { id: "2", name: "TechStart Labs", industry: "Technology" },
  { id: "3", name: "Green Valley Landscaping", industry: "Services" },
]

export const periods = [
  { id: "2024-12", label: "December 2024" },
  { id: "2024-11", label: "November 2024" },
  { id: "2024-10", label: "October 2024" },
  { id: "2024-q4", label: "Q4 2024" },
  { id: "2024-fy", label: "FY 2024" },
]

export const entities = [
  { id: "1", name: "Main Operating Co." },
  { id: "2", name: "Holding Co." },
  { id: "3", name: "West Coast Division" },
]

export type ImportFile = {
  id: string
  fileName: string
  type: "Trial Balance" | "General Ledger" | "Chart of Accounts"
  period: string
  uploadedBy: string
  dateUploaded: string
  status: "Processing" | "Validated" | "Has Issues" | "Imported"
  validationIssues: number
}

export const importHistory: ImportFile[] = [
  {
    id: "1",
    fileName: "TB_Dec2024_SunriseCoffee.xlsx",
    type: "Trial Balance",
    period: "December 2024",
    uploadedBy: "Sarah Johnson",
    dateUploaded: "2024-12-15",
    status: "Has Issues",
    validationIssues: 3,
  },
  {
    id: "2",
    fileName: "GL_Dec2024_Full.csv",
    type: "General Ledger",
    period: "December 2024",
    uploadedBy: "Sarah Johnson",
    dateUploaded: "2024-12-15",
    status: "Validated",
    validationIssues: 0,
  },
  {
    id: "3",
    fileName: "COA_Export_QB.xlsx",
    type: "Chart of Accounts",
    period: "FY 2024",
    uploadedBy: "Mike Chen",
    dateUploaded: "2024-12-10",
    status: "Imported",
    validationIssues: 0,
  },
  {
    id: "4",
    fileName: "TB_Nov2024_Draft.csv",
    type: "Trial Balance",
    period: "November 2024",
    uploadedBy: "Sarah Johnson",
    dateUploaded: "2024-11-30",
    status: "Imported",
    validationIssues: 0,
  },
]

export type ValidationIssue = {
  id: string
  type: "error" | "warning"
  category: string
  message: string
  affectedItems: number
}

export const validationIssues: ValidationIssue[] = [
  { id: "1", type: "error", category: "Out of Balance", message: "Trial balance is out of balance by $1,250.00", affectedItems: 1 },
  { id: "2", type: "warning", category: "Missing Account", message: "2 accounts have no account numbers", affectedItems: 2 },
  { id: "3", type: "warning", category: "Unmapped", message: "5 accounts are not mapped to taxonomy", affectedItems: 5 },
  { id: "4", type: "error", category: "Duplicate", message: "Duplicate account number: 1100", affectedItems: 2 },
]

export type Account = {
  id: string
  accountNumber: string
  accountName: string
  accountType: "Asset" | "Liability" | "Equity" | "Revenue" | "Expense"
  normalBalance: "Debit" | "Credit"
  fsLine: string
  taxonomyCategory: string | null
  active: boolean
  source: "Imported" | "Manual" | "System"
  lastModified: string
  balance: number
}

export const chartOfAccounts: Account[] = [
  { id: "1", accountNumber: "1000", accountName: "Cash - Operating", accountType: "Asset", normalBalance: "Debit", fsLine: "Cash and Cash Equivalents", taxonomyCategory: "Cash", active: true, source: "Imported", lastModified: "2024-12-10", balance: 45230.50 },
  { id: "2", accountNumber: "1050", accountName: "Petty Cash", accountType: "Asset", normalBalance: "Debit", fsLine: "Cash and Cash Equivalents", taxonomyCategory: "Cash", active: true, source: "Imported", lastModified: "2024-12-10", balance: 500.00 },
  { id: "3", accountNumber: "1100", accountName: "Accounts Receivable", accountType: "Asset", normalBalance: "Debit", fsLine: "Accounts Receivable", taxonomyCategory: "Accounts Receivable", active: true, source: "Imported", lastModified: "2024-12-10", balance: 28750.00 },
  { id: "4", accountNumber: "1150", accountName: "Allowance for Doubtful Accounts", accountType: "Asset", normalBalance: "Credit", fsLine: "Accounts Receivable", taxonomyCategory: "Accounts Receivable", active: true, source: "Manual", lastModified: "2024-12-12", balance: -2875.00 },
  { id: "5", accountNumber: "1200", accountName: "Inventory - Coffee Beans", accountType: "Asset", normalBalance: "Debit", fsLine: "Inventory", taxonomyCategory: "Inventory", active: true, source: "Imported", lastModified: "2024-12-10", balance: 15420.00 },
  { id: "6", accountNumber: "1210", accountName: "Inventory - Supplies", accountType: "Asset", normalBalance: "Debit", fsLine: "Inventory", taxonomyCategory: "Inventory", active: true, source: "Imported", lastModified: "2024-12-10", balance: 3250.00 },
  { id: "7", accountNumber: "1300", accountName: "Prepaid Insurance", accountType: "Asset", normalBalance: "Debit", fsLine: "Prepaid Expenses", taxonomyCategory: "Prepaids", active: true, source: "Imported", lastModified: "2024-12-10", balance: 4800.00 },
  { id: "8", accountNumber: "1310", accountName: "Prepaid Rent", accountType: "Asset", normalBalance: "Debit", fsLine: "Prepaid Expenses", taxonomyCategory: "Prepaids", active: true, source: "Imported", lastModified: "2024-12-10", balance: 6000.00 },
  { id: "9", accountNumber: "1500", accountName: "Equipment", accountType: "Asset", normalBalance: "Debit", fsLine: "Property and Equipment", taxonomyCategory: "Fixed Assets", active: true, source: "Imported", lastModified: "2024-12-10", balance: 85000.00 },
  { id: "10", accountNumber: "1510", accountName: "Accumulated Depreciation - Equipment", accountType: "Asset", normalBalance: "Credit", fsLine: "Property and Equipment", taxonomyCategory: "Fixed Assets", active: true, source: "Imported", lastModified: "2024-12-10", balance: -25500.00 },
  { id: "11", accountNumber: "1520", accountName: "Leasehold Improvements", accountType: "Asset", normalBalance: "Debit", fsLine: "Property and Equipment", taxonomyCategory: "Fixed Assets", active: true, source: "Imported", lastModified: "2024-12-10", balance: 42000.00 },
  { id: "12", accountNumber: "2000", accountName: "Accounts Payable", accountType: "Liability", normalBalance: "Credit", fsLine: "Accounts Payable", taxonomyCategory: "Accounts Payable", active: true, source: "Imported", lastModified: "2024-12-10", balance: 18500.00 },
  { id: "13", accountNumber: "2100", accountName: "Accrued Wages", accountType: "Liability", normalBalance: "Credit", fsLine: "Accrued Liabilities", taxonomyCategory: "Accrued Expenses", active: true, source: "Imported", lastModified: "2024-12-10", balance: 8750.00 },
  { id: "14", accountNumber: "2110", accountName: "Accrued Payroll Taxes", accountType: "Liability", normalBalance: "Credit", fsLine: "Accrued Liabilities", taxonomyCategory: "Accrued Expenses", active: true, source: "Imported", lastModified: "2024-12-10", balance: 2450.00 },
  { id: "15", accountNumber: "2200", accountName: "Sales Tax Payable", accountType: "Liability", normalBalance: "Credit", fsLine: "Other Current Liabilities", taxonomyCategory: "Accrued Expenses", active: true, source: "Imported", lastModified: "2024-12-10", balance: 3200.00 },
  { id: "16", accountNumber: "2500", accountName: "Equipment Loan", accountType: "Liability", normalBalance: "Credit", fsLine: "Long-term Debt", taxonomyCategory: "Debt", active: true, source: "Imported", lastModified: "2024-12-10", balance: 35000.00 },
  { id: "17", accountNumber: "3000", accountName: "Common Stock", accountType: "Equity", normalBalance: "Credit", fsLine: "Stockholders Equity", taxonomyCategory: "Equity", active: true, source: "Imported", lastModified: "2024-12-10", balance: 50000.00 },
  { id: "18", accountNumber: "3100", accountName: "Retained Earnings", accountType: "Equity", normalBalance: "Credit", fsLine: "Retained Earnings", taxonomyCategory: "Equity", active: true, source: "Imported", lastModified: "2024-12-10", balance: 42575.50 },
  { id: "19", accountNumber: "4000", accountName: "Sales - Coffee", accountType: "Revenue", normalBalance: "Credit", fsLine: "Net Revenue", taxonomyCategory: "Revenue", active: true, source: "Imported", lastModified: "2024-12-10", balance: 185000.00 },
  { id: "20", accountNumber: "4010", accountName: "Sales - Food", accountType: "Revenue", normalBalance: "Credit", fsLine: "Net Revenue", taxonomyCategory: "Revenue", active: true, source: "Imported", lastModified: "2024-12-10", balance: 62000.00 },
  { id: "21", accountNumber: "4020", accountName: "Sales - Merchandise", accountType: "Revenue", normalBalance: "Credit", fsLine: "Net Revenue", taxonomyCategory: "Revenue", active: true, source: "Imported", lastModified: "2024-12-10", balance: 15500.00 },
  { id: "22", accountNumber: "5000", accountName: "Cost of Goods Sold - Coffee", accountType: "Expense", normalBalance: "Debit", fsLine: "Cost of Revenue", taxonomyCategory: "COGS", active: true, source: "Imported", lastModified: "2024-12-10", balance: 55500.00 },
  { id: "23", accountNumber: "5010", accountName: "Cost of Goods Sold - Food", accountType: "Expense", normalBalance: "Debit", fsLine: "Cost of Revenue", taxonomyCategory: "COGS", active: true, source: "Imported", lastModified: "2024-12-10", balance: 24800.00 },
  { id: "24", accountNumber: "6000", accountName: "Wages and Salaries", accountType: "Expense", normalBalance: "Debit", fsLine: "Operating Expenses", taxonomyCategory: "Payroll", active: true, source: "Imported", lastModified: "2024-12-10", balance: 78000.00 },
  { id: "25", accountNumber: "6010", accountName: "Payroll Taxes", accountType: "Expense", normalBalance: "Debit", fsLine: "Operating Expenses", taxonomyCategory: "Payroll", active: true, source: "Imported", lastModified: "2024-12-10", balance: 5967.00 },
  { id: "26", accountNumber: "6020", accountName: "Employee Benefits", accountType: "Expense", normalBalance: "Debit", fsLine: "Operating Expenses", taxonomyCategory: "Payroll", active: true, source: "Imported", lastModified: "2024-12-10", balance: 12000.00 },
  { id: "27", accountNumber: "6100", accountName: "Rent Expense", accountType: "Expense", normalBalance: "Debit", fsLine: "Operating Expenses", taxonomyCategory: "Rent", active: true, source: "Imported", lastModified: "2024-12-10", balance: 36000.00 },
  { id: "28", accountNumber: "6200", accountName: "Utilities", accountType: "Expense", normalBalance: "Debit", fsLine: "Operating Expenses", taxonomyCategory: "Other Operating Expenses", active: true, source: "Imported", lastModified: "2024-12-10", balance: 8400.00 },
  { id: "29", accountNumber: "6300", accountName: "Professional Fees", accountType: "Expense", normalBalance: "Debit", fsLine: "Operating Expenses", taxonomyCategory: "Professional Fees", active: true, source: "Imported", lastModified: "2024-12-10", balance: 4500.00 },
  { id: "30", accountNumber: "6400", accountName: "Insurance Expense", accountType: "Expense", normalBalance: "Debit", fsLine: "Operating Expenses", taxonomyCategory: "Other Operating Expenses", active: true, source: "Imported", lastModified: "2024-12-10", balance: 7200.00 },
  { id: "31", accountNumber: "6500", accountName: "Depreciation Expense", accountType: "Expense", normalBalance: "Debit", fsLine: "Operating Expenses", taxonomyCategory: "Other Operating Expenses", active: true, source: "Imported", lastModified: "2024-12-10", balance: 8500.00 },
  { id: "32", accountNumber: "6600", accountName: "Miscellaneous Expense", accountType: "Expense", normalBalance: "Debit", fsLine: "Operating Expenses", taxonomyCategory: null, active: true, source: "Imported", lastModified: "2024-12-10", balance: 2850.00 },
  { id: "33", accountNumber: "6700", accountName: "Bank Charges", accountType: "Expense", normalBalance: "Debit", fsLine: "Other Expenses", taxonomyCategory: null, active: true, source: "Imported", lastModified: "2024-12-10", balance: 1200.00 },
  { id: "34", accountNumber: "", accountName: "Uncategorized Income", accountType: "Revenue", normalBalance: "Credit", fsLine: "", taxonomyCategory: null, active: false, source: "Imported", lastModified: "2024-12-10", balance: 0 },
  { id: "35", accountNumber: "1100", accountName: "AR - Trade (Duplicate)", accountType: "Asset", normalBalance: "Debit", fsLine: "Accounts Receivable", taxonomyCategory: null, active: false, source: "Imported", lastModified: "2024-12-10", balance: 0 },
]

export const taxonomyCategories = [
  { id: "cash", name: "Cash", type: "Asset", children: [] },
  { id: "ar", name: "Accounts Receivable", type: "Asset", children: [] },
  { id: "inventory", name: "Inventory", type: "Asset", children: [] },
  { id: "prepaids", name: "Prepaids", type: "Asset", children: [] },
  { id: "fixed-assets", name: "Fixed Assets", type: "Asset", children: ["Land", "Buildings", "Equipment", "Vehicles", "Accumulated Depreciation"] },
  { id: "ap", name: "Accounts Payable", type: "Liability", children: [] },
  { id: "accrued", name: "Accrued Expenses", type: "Liability", children: ["Accrued Wages", "Accrued Interest", "Accrued Taxes", "Other Accruals"] },
  { id: "debt", name: "Debt", type: "Liability", children: ["Short-term Debt", "Long-term Debt", "Notes Payable"] },
  { id: "equity", name: "Equity", type: "Equity", children: ["Common Stock", "Preferred Stock", "Retained Earnings", "APIC"] },
  { id: "revenue", name: "Revenue", type: "Revenue", children: ["Product Revenue", "Service Revenue", "Other Revenue"] },
  { id: "cogs", name: "COGS", type: "Expense", children: ["Direct Materials", "Direct Labor", "Manufacturing Overhead"] },
  { id: "payroll", name: "Payroll", type: "Expense", children: ["Salaries", "Wages", "Payroll Taxes", "Benefits"] },
  { id: "rent", name: "Rent", type: "Expense", children: [] },
  { id: "professional", name: "Professional Fees", type: "Expense", children: ["Legal", "Accounting", "Consulting"] },
  { id: "other-opex", name: "Other Operating Expenses", type: "Expense", children: ["Utilities", "Insurance", "Depreciation", "Travel", "Marketing"] },
]

export type JournalEntry = {
  id: string
  jeNumber: string
  date: string
  period: string
  entity: string
  accountId: string
  accountNumber: string
  accountName: string
  debit: number
  credit: number
  description: string
  adjustmentType: "Accrual" | "Reclass" | "Correction" | "Depreciation" | "Amortization" | "Elimination" | "Tax Adjustment" | "Opening Balance" | "Other"
  status: "Draft" | "Ready for Review" | "Reviewed" | "Posted" | "Rejected"
  preparedBy: string
  reviewedBy: string | null
  sourceSupport: string | null
  tags: string[]
  comments: string[]
  createdAt: string
  updatedAt: string
}

export const journalEntries: JournalEntry[] = [
  {
    id: "1",
    jeNumber: "AJE-2024-001",
    date: "2024-12-31",
    period: "December 2024",
    entity: "Main Operating Co.",
    accountId: "27",
    accountNumber: "6100",
    accountName: "Rent Expense",
    debit: 3000,
    credit: 0,
    description: "December rent accrual",
    adjustmentType: "Accrual",
    status: "Posted",
    preparedBy: "Sarah Johnson",
    reviewedBy: "Mike Chen",
    sourceSupport: "Lease agreement",
    tags: ["Monthly", "Recurring"],
    comments: ["Verified against lease"],
    createdAt: "2024-12-28",
    updatedAt: "2024-12-30",
  },
  {
    id: "2",
    jeNumber: "AJE-2024-001",
    date: "2024-12-31",
    period: "December 2024",
    entity: "Main Operating Co.",
    accountId: "8",
    accountNumber: "1310",
    accountName: "Prepaid Rent",
    debit: 0,
    credit: 3000,
    description: "December rent accrual",
    adjustmentType: "Accrual",
    status: "Posted",
    preparedBy: "Sarah Johnson",
    reviewedBy: "Mike Chen",
    sourceSupport: "Lease agreement",
    tags: ["Monthly", "Recurring"],
    comments: ["Verified against lease"],
    createdAt: "2024-12-28",
    updatedAt: "2024-12-30",
  },
  {
    id: "3",
    jeNumber: "AJE-2024-002",
    date: "2024-12-31",
    period: "December 2024",
    entity: "Main Operating Co.",
    accountId: "31",
    accountNumber: "6500",
    accountName: "Depreciation Expense",
    debit: 1416.67,
    credit: 0,
    description: "Monthly depreciation - Equipment",
    adjustmentType: "Depreciation",
    status: "Reviewed",
    preparedBy: "Sarah Johnson",
    reviewedBy: "Mike Chen",
    sourceSupport: "Depreciation schedule",
    tags: ["Monthly", "Recurring"],
    comments: [],
    createdAt: "2024-12-29",
    updatedAt: "2024-12-30",
  },
  {
    id: "4",
    jeNumber: "AJE-2024-002",
    date: "2024-12-31",
    period: "December 2024",
    entity: "Main Operating Co.",
    accountId: "10",
    accountNumber: "1510",
    accountName: "Accumulated Depreciation - Equipment",
    debit: 0,
    credit: 1416.67,
    description: "Monthly depreciation - Equipment",
    adjustmentType: "Depreciation",
    status: "Reviewed",
    preparedBy: "Sarah Johnson",
    reviewedBy: "Mike Chen",
    sourceSupport: "Depreciation schedule",
    tags: ["Monthly", "Recurring"],
    comments: [],
    createdAt: "2024-12-29",
    updatedAt: "2024-12-30",
  },
  {
    id: "5",
    jeNumber: "AJE-2024-003",
    date: "2024-12-31",
    period: "December 2024",
    entity: "Main Operating Co.",
    accountId: "4",
    accountNumber: "1150",
    accountName: "Allowance for Doubtful Accounts",
    debit: 0,
    credit: 575,
    description: "Bad debt reserve adjustment - 2% of AR",
    adjustmentType: "Accrual",
    status: "Ready for Review",
    preparedBy: "Sarah Johnson",
    reviewedBy: null,
    sourceSupport: "AR aging report",
    tags: ["Quarter-end"],
    comments: ["Need to verify aging bucket"],
    createdAt: "2024-12-30",
    updatedAt: "2024-12-30",
  },
  {
    id: "6",
    jeNumber: "AJE-2024-003",
    date: "2024-12-31",
    period: "December 2024",
    entity: "Main Operating Co.",
    accountId: "32",
    accountNumber: "6600",
    accountName: "Miscellaneous Expense",
    debit: 575,
    credit: 0,
    description: "Bad debt reserve adjustment - 2% of AR",
    adjustmentType: "Accrual",
    status: "Ready for Review",
    preparedBy: "Sarah Johnson",
    reviewedBy: null,
    sourceSupport: "AR aging report",
    tags: ["Quarter-end"],
    comments: ["Need to verify aging bucket"],
    createdAt: "2024-12-30",
    updatedAt: "2024-12-30",
  },
  {
    id: "7",
    jeNumber: "AJE-2024-004",
    date: "2024-12-31",
    period: "December 2024",
    entity: "Main Operating Co.",
    accountId: "28",
    accountNumber: "6200",
    accountName: "Utilities",
    debit: 850,
    credit: 0,
    description: "Reclass utility deposit from prepaid",
    adjustmentType: "Reclass",
    status: "Draft",
    preparedBy: "Sarah Johnson",
    reviewedBy: null,
    sourceSupport: null,
    tags: [],
    comments: [],
    createdAt: "2024-12-31",
    updatedAt: "2024-12-31",
  },
  {
    id: "8",
    jeNumber: "AJE-2024-004",
    date: "2024-12-31",
    period: "December 2024",
    entity: "Main Operating Co.",
    accountId: "7",
    accountNumber: "1300",
    accountName: "Prepaid Insurance",
    debit: 0,
    credit: 850,
    description: "Reclass utility deposit from prepaid",
    adjustmentType: "Reclass",
    status: "Draft",
    preparedBy: "Sarah Johnson",
    reviewedBy: null,
    sourceSupport: null,
    tags: [],
    comments: [],
    createdAt: "2024-12-31",
    updatedAt: "2024-12-31",
  },
  {
    id: "9",
    jeNumber: "AJE-2024-005",
    date: "2024-12-31",
    period: "December 2024",
    entity: "Main Operating Co.",
    accountId: "13",
    accountNumber: "2100",
    accountName: "Accrued Wages",
    debit: 0,
    credit: 4250,
    description: "Accrue wages for Dec 26-31",
    adjustmentType: "Accrual",
    status: "Rejected",
    preparedBy: "Sarah Johnson",
    reviewedBy: "Mike Chen",
    sourceSupport: "Payroll register",
    tags: ["Period-end"],
    comments: ["Amount seems too low - verify with payroll"],
    createdAt: "2024-12-30",
    updatedAt: "2024-12-31",
  },
  {
    id: "10",
    jeNumber: "AJE-2024-005",
    date: "2024-12-31",
    period: "December 2024",
    entity: "Main Operating Co.",
    accountId: "24",
    accountNumber: "6000",
    accountName: "Wages and Salaries",
    debit: 4250,
    credit: 0,
    description: "Accrue wages for Dec 26-31",
    adjustmentType: "Accrual",
    status: "Rejected",
    preparedBy: "Sarah Johnson",
    reviewedBy: "Mike Chen",
    sourceSupport: "Payroll register",
    tags: ["Period-end"],
    comments: ["Amount seems too low - verify with payroll"],
    createdAt: "2024-12-30",
    updatedAt: "2024-12-31",
  },
]

export const adjustmentTypes = [
  "Accrual",
  "Reclass",
  "Correction",
  "Depreciation",
  "Amortization",
  "Elimination",
  "Tax Adjustment",
  "Opening Balance",
  "Other",
] as const

export const jeStatuses = [
  "Draft",
  "Ready for Review",
  "Reviewed",
  "Posted",
  "Rejected",
] as const

// Aggregate JE data for batch view
export const getJEBatches = () => {
  const batches = journalEntries.reduce((acc, je) => {
    if (!acc[je.jeNumber]) {
      acc[je.jeNumber] = {
        jeNumber: je.jeNumber,
        date: je.date,
        period: je.period,
        entity: je.entity,
        description: je.description,
        adjustmentType: je.adjustmentType,
        status: je.status,
        preparedBy: je.preparedBy,
        reviewedBy: je.reviewedBy,
        totalDebit: 0,
        totalCredit: 0,
        lineCount: 0,
        hasSupport: !!je.sourceSupport,
        comments: je.comments,
      }
    }
    acc[je.jeNumber].totalDebit += je.debit
    acc[je.jeNumber].totalCredit += je.credit
    acc[je.jeNumber].lineCount++
    return acc
  }, {} as Record<string, {
    jeNumber: string
    date: string
    period: string
    entity: string
    description: string
    adjustmentType: string
    status: string
    preparedBy: string
    reviewedBy: string | null
    totalDebit: number
    totalCredit: number
    lineCount: number
    hasSupport: boolean
    comments: string[]
  }>)
  return Object.values(batches)
}

// Report preview data
export type ReportLine = {
  id: string
  lineItem: string
  level: number
  importedBalance: number
  postedAdjustments: number
  draftAdjustments: number
  adjustedBalance: number
  accounts: string[]
}

export const trialBalanceData: ReportLine[] = [
  { id: "1", lineItem: "Cash and Cash Equivalents", level: 0, importedBalance: 45730.50, postedAdjustments: 0, draftAdjustments: 0, adjustedBalance: 45730.50, accounts: ["1000", "1050"] },
  { id: "2", lineItem: "Accounts Receivable, net", level: 0, importedBalance: 25875.00, postedAdjustments: 0, draftAdjustments: -575, adjustedBalance: 25300.00, accounts: ["1100", "1150"] },
  { id: "3", lineItem: "Inventory", level: 0, importedBalance: 18670.00, postedAdjustments: 0, draftAdjustments: 0, adjustedBalance: 18670.00, accounts: ["1200", "1210"] },
  { id: "4", lineItem: "Prepaid Expenses", level: 0, importedBalance: 10800.00, postedAdjustments: -3000, draftAdjustments: -850, adjustedBalance: 6950.00, accounts: ["1300", "1310"] },
  { id: "5", lineItem: "Property and Equipment, net", level: 0, importedBalance: 101500.00, postedAdjustments: -1416.67, draftAdjustments: 0, adjustedBalance: 100083.33, accounts: ["1500", "1510", "1520"] },
  { id: "6", lineItem: "Total Assets", level: 0, importedBalance: 202575.50, postedAdjustments: -4416.67, draftAdjustments: -1425, adjustedBalance: 196733.83, accounts: [] },
]

export const incomeStatementData: ReportLine[] = [
  { id: "1", lineItem: "Revenue", level: 0, importedBalance: 262500.00, postedAdjustments: 0, draftAdjustments: 0, adjustedBalance: 262500.00, accounts: ["4000", "4010", "4020"] },
  { id: "2", lineItem: "Cost of Revenue", level: 0, importedBalance: 80300.00, postedAdjustments: 0, draftAdjustments: 0, adjustedBalance: 80300.00, accounts: ["5000", "5010"] },
  { id: "3", lineItem: "Gross Profit", level: 0, importedBalance: 182200.00, postedAdjustments: 0, draftAdjustments: 0, adjustedBalance: 182200.00, accounts: [] },
  { id: "4", lineItem: "Operating Expenses", level: 0, importedBalance: 164617.00, postedAdjustments: 4416.67, draftAdjustments: 1425, adjustedBalance: 170458.67, accounts: ["6000", "6010", "6020", "6100", "6200", "6300", "6400", "6500", "6600"] },
  { id: "5", lineItem: "Operating Income", level: 0, importedBalance: 17583.00, postedAdjustments: -4416.67, draftAdjustments: -1425, adjustedBalance: 11741.33, accounts: [] },
]
