"use client";

import { useState, useMemo } from "react";
import {
  Download,
  Filter,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Check,
  AlertCircle,
  Plus,
  X,
  FileText,
  Paperclip,
  MessageSquare,
  MoreHorizontal,
  ChevronDown,
  ChevronRight,
  Edit3,
  Trash2,
  Copy,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type AccountCategory = "asset" | "liability" | "equity" | "income" | "expense";

interface BridgeAccount {
  id: string;
  accountNumber: string;
  description: string;
  category: AccountCategory;
  isNew?: boolean;
  bookBalance: number;
  ryobiPortion?: number;
  aje1?: number;
  aje2?: number;
  aje3?: number;
  aje4?: number;
  aje5?: number;
  priorPeriodNet?: number;
  adj2023?: number;
  aje6?: number;
  aje7?: number;
  aje8?: number;
  aje9?: number;
  currentYearNet?: number;
  adj2024?: number;
}

interface JournalEntryLine {
  id: string;
  accountNumber: string;
  accountDescription: string;
  debit: number;
  credit: number;
  memo?: string;
}

interface QuickJournalEntry {
  ajeNumber: string;
  description: string;
  period: "2023" | "2024";
  lines: JournalEntryLine[];
  memo: string;
  reference: string;
}

const mockBridgeData: BridgeAccount[] = [
  // ASSETS
  {
    id: "1",
    accountNumber: "1600-09",
    description: "Ryobi 920ST-5 (QB asset — REMOVED)",
    category: "asset",
    bookBalance: 512000.0,
    ryobiPortion: 512000.0,
    aje1: -512000.0,
    priorPeriodNet: 0,
    adj2023: 0,
  },
  {
    id: "2",
    accountNumber: "1601",
    description: "ROU Asset — Ryobi Op. Lease",
    category: "asset",
    isNew: true,
    bookBalance: 0,
    aje1: 512000.0,
    aje4: 42382.96,
    priorPeriodNet: 0,
    adj2023: 554382.96,
    aje6: 67429.87,
    aje9: 67429.87,
    currentYearNet: 0,
    adj2024: 621812.83,
  },
  {
    id: "3",
    accountNumber: "1700",
    description: "Accumulated Depreciation (other; Ryobi=$0)",
    category: "asset",
    bookBalance: -183301.77,
    priorPeriodNet: 0,
    adj2023: -183301.77,
  },
  {
    id: "4",
    accountNumber: "1811",
    description: "Accumulated Amortization — ROU Asset",
    category: "asset",
    isNew: true,
    bookBalance: 0,
    aje4: -42382.96,
    priorPeriodNet: 0,
    adj2023: -42382.96,
    aje9: -67429.87,
    currentYearNet: 0,
    adj2024: -109812.83,
  },
  // LIABILITIES
  {
    id: "5",
    accountNumber: "2305",
    description: "Op. Lease Liability — Current",
    category: "liability",
    isNew: true,
    bookBalance: 0,
    priorPeriodNet: 0,
    adj2023: 0,
  },
  {
    id: "6",
    accountNumber: "2310",
    description: "Op. Lease Liability — Non-Current",
    category: "liability",
    isNew: true,
    bookBalance: 0,
    aje1: 469617.04,
    priorPeriodNet: 0,
    adj2023: 469617.04,
    aje6: 67429.87,
    currentYearNet: 0,
    adj2024: 402187.17,
  },
  {
    id: "7",
    accountNumber: "2611",
    description: "Note - EIDL COVID 19",
    category: "liability",
    bookBalance: -500000.0,
    priorPeriodNet: 0,
    adj2023: -500000.0,
  },
  {
    id: "8",
    accountNumber: "2613",
    description: "Note - Kalamata Capital Group",
    category: "liability",
    bookBalance: 1682.45,
    priorPeriodNet: 0,
    adj2023: 1682.45,
  },
  {
    id: "9",
    accountNumber: "2614",
    description: "Note - Daimler Truck Financial",
    category: "liability",
    bookBalance: -3449.73,
    priorPeriodNet: 0,
    adj2023: -3449.73,
  },
  {
    id: "10",
    accountNumber: "2615",
    description: "Note IFSC — Ryobi Press (REMOVED via AJE-2)",
    category: "liability",
    bookBalance: -475489.61,
    aje2: 475489.61,
    priorPeriodNet: 0,
    adj2023: 0,
  },
  // EQUITY
  {
    id: "11",
    accountNumber: "3021",
    description: "LM Partner 1 Equity — JDR",
    category: "equity",
    bookBalance: 548641.46,
    priorPeriodNet: 0,
    adj2023: 548641.46,
  },
  {
    id: "12",
    accountNumber: "3022",
    description: "LM Partner 2 Equity — MFS",
    category: "equity",
    bookBalance: 642292.93,
    priorPeriodNet: 0,
    adj2023: 642292.93,
  },
  {
    id: "13",
    accountNumber: "3040",
    description: "LM Partner 1 Draws — JDR",
    category: "equity",
    bookBalance: -67835.78,
    priorPeriodNet: 0,
    adj2023: -67835.78,
  },
  {
    id: "14",
    accountNumber: "3041",
    description: "LM Partner 2 Draws — MFS",
    category: "equity",
    bookBalance: -82466.08,
    priorPeriodNet: 0,
    adj2023: -82466.08,
  },
  {
    id: "15",
    accountNumber: "3311",
    description: "Partner 1 Capital Adj Holding — JDR",
    category: "equity",
    isNew: true,
    bookBalance: 0,
    aje3: -2936.29,
    aje4: 10469.31,
    aje5: -38983.0,
    priorPeriodNet: 0,
    adj2023: -31449.98,
    aje7: 16712.2,
    aje8: -49242.0,
    currentYearNet: 0,
    adj2024: -97694.72,
  },
  {
    id: "16",
    accountNumber: "3312",
    description: "Partner 2 Capital Adj Holding — MFS",
    category: "equity",
    isNew: true,
    bookBalance: 0,
    aje3: -2936.29,
    aje4: 10469.31,
    aje5: -38983.0,
    priorPeriodNet: 0,
    adj2023: -31449.98,
    aje7: 16712.2,
    aje8: -49242.0,
    currentYearNet: 0,
    adj2024: -97694.72,
  },
  // P&L / EXPENSES
  {
    id: "17",
    accountNumber: "5300-11",
    description: "Sales Tax Ryobi Press (2023 — classification only)",
    category: "expense",
    bookBalance: 2562.29,
    aje2: 2297.96,
    priorPeriodNet: 0,
    adj2023: 2562.29,
  },
  {
    id: "18",
    accountNumber: "5390",
    description: "Taxes - Paid on Purchases (2023)",
    category: "expense",
    bookBalance: 1519.23,
    aje2: 574.49,
    priorPeriodNet: 0,
    adj2023: 1519.23,
  },
  {
    id: "19",
    accountNumber: "6210",
    description: "Operating Lease Expense",
    category: "expense",
    isNew: true,
    bookBalance: 0,
    aje5: 77966.0,
    priorPeriodNet: 0,
    adj2023: 77966.0,
    aje8: 98484.0,
    currentYearNet: 0,
    adj2024: 176450.0,
  },
  {
    id: "20",
    accountNumber: "6400-03",
    description: "Bank Service Charges (IDC $870 expensed here)",
    category: "expense",
    bookBalance: 870.0,
    priorPeriodNet: 0,
    adj2023: 0,
  },
  {
    id: "21",
    accountNumber: "6400-05",
    description: "Interest Expense (total; Ryobi portion only adjusted)",
    category: "expense",
    bookBalance: 24435.27,
    aje3: 20938.61,
    aje5: -20938.61,
    priorPeriodNet: 0,
    adj2023: 3496.66,
    aje7: -33424.4,
    currentYearNet: 0,
    adj2024: 32078.0,
  },
];

const categoryStyles: Record<
  AccountCategory,
  { bg: string; text: string; label: string; rowBg: string }
> = {
  asset: {
    bg: "bg-blue-600",
    text: "text-white",
    label: "ASSETS — QB shown as positive (DR normal balance)",
    rowBg: "bg-blue-50/50",
  },
  liability: {
    bg: "bg-orange-500",
    text: "text-white",
    label: "LIABILITIES — QB shown as negative (CR normal balance)",
    rowBg: "bg-orange-50/50",
  },
  equity: {
    bg: "bg-yellow-400",
    text: "text-yellow-900",
    label: "EQUITY — PARTNERSHIP CAPITAL ACCOUNTS",
    rowBg: "bg-yellow-50/50",
  },
  income: {
    bg: "bg-emerald-600",
    text: "text-white",
    label: "INCOME — CR=positive",
    rowBg: "bg-emerald-50/50",
  },
  expense: {
    bg: "bg-green-700",
    text: "text-white",
    label: "P&L / EXPENSES — DR=positive, CR=negative",
    rowBg: "bg-green-50/50",
  },
};

const formatCurrency = (value: number | undefined): string => {
  if (value === undefined || value === 0) return "";
  const formatted = Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return value < 0 ? `($${formatted})` : `$${formatted}`;
};

const getCellClass = (value: number | undefined): string => {
  if (value === undefined || value === 0) return "text-muted-foreground";
  return value < 0 ? "text-red-600 font-medium" : "text-foreground";
};

// Available accounts for the journal entry form
const availableAccounts = mockBridgeData.map((a) => ({
  number: a.accountNumber,
  description: a.description,
  category: a.category,
}));

export function BridgePreview() {
  const [zoom, setZoom] = useState(100);
  const [selectedPeriod, setSelectedPeriod] = useState("2023");
  const [isAddEntryOpen, setIsAddEntryOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<BridgeAccount | null>(null);
  const [selectedAjeColumn, setSelectedAjeColumn] = useState<string | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<AccountCategory>>(
    new Set(["asset", "liability", "equity", "expense"])
  );

  // New journal entry form state
  const [newEntry, setNewEntry] = useState<QuickJournalEntry>({
    ajeNumber: "",
    description: "",
    period: "2024",
    lines: [
      { id: "1", accountNumber: "", accountDescription: "", debit: 0, credit: 0 },
      { id: "2", accountNumber: "", accountDescription: "", debit: 0, credit: 0 },
    ],
    memo: "",
    reference: "",
  });

  // Group accounts by category
  const groupedAccounts = useMemo(() => {
    const groups: Record<AccountCategory, BridgeAccount[]> = {
      asset: [],
      liability: [],
      equity: [],
      income: [],
      expense: [],
    };
    mockBridgeData.forEach((account) => {
      groups[account.category].push(account);
    });
    return groups;
  }, []);

  // Calculate column totals
  const columnTotals = useMemo(() => {
    return mockBridgeData.reduce(
      (acc, account) => {
        acc.bookBalance += account.bookBalance || 0;
        acc.ryobiPortion += account.ryobiPortion || 0;
        acc.aje1 += account.aje1 || 0;
        acc.aje2 += account.aje2 || 0;
        acc.aje3 += account.aje3 || 0;
        acc.aje4 += account.aje4 || 0;
        acc.aje5 += account.aje5 || 0;
        acc.aje6 += account.aje6 || 0;
        acc.aje7 += account.aje7 || 0;
        acc.aje8 += account.aje8 || 0;
        acc.aje9 += account.aje9 || 0;
        return acc;
      },
      {
        bookBalance: 0,
        ryobiPortion: 0,
        aje1: 0,
        aje2: 0,
        aje3: 0,
        aje4: 0,
        aje5: 0,
        aje6: 0,
        aje7: 0,
        aje8: 0,
        aje9: 0,
      }
    );
  }, []);

  const isColumnBalanced = (total: number) => Math.abs(total) < 0.01;

  const totalDebits = newEntry.lines.reduce((sum, line) => sum + (line.debit || 0), 0);
  const totalCredits = newEntry.lines.reduce((sum, line) => sum + (line.credit || 0), 0);
  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;

  const handleAddLine = () => {
    setNewEntry({
      ...newEntry,
      lines: [
        ...newEntry.lines,
        {
          id: String(newEntry.lines.length + 1),
          accountNumber: "",
          accountDescription: "",
          debit: 0,
          credit: 0,
        },
      ],
    });
  };

  const handleRemoveLine = (id: string) => {
    if (newEntry.lines.length > 2) {
      setNewEntry({
        ...newEntry,
        lines: newEntry.lines.filter((line) => line.id !== id),
      });
    }
  };

  const handleLineChange = (
    id: string,
    field: keyof JournalEntryLine,
    value: string | number
  ) => {
    setNewEntry({
      ...newEntry,
      lines: newEntry.lines.map((line) =>
        line.id === id ? { ...line, [field]: value } : line
      ),
    });
  };

  const handleAccountSelect = (lineId: string, accountNumber: string) => {
    const account = availableAccounts.find((a) => a.number === accountNumber);
    if (account) {
      handleLineChange(lineId, "accountNumber", accountNumber);
      handleLineChange(lineId, "accountDescription", account.description);
    }
  };

  const toggleCategory = (category: AccountCategory) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  const openAddEntryFromRow = (account: BridgeAccount, ajeColumn?: string) => {
    setSelectedAccount(account);
    setSelectedAjeColumn(ajeColumn || null);
    // Pre-populate the first line with the selected account
    setNewEntry({
      ajeNumber: ajeColumn ? `AJE-${ajeColumn.replace("aje", "")}` : "AJE-10",
      description: "",
      period: selectedPeriod as "2023" | "2024",
      lines: [
        {
          id: "1",
          accountNumber: account.accountNumber,
          accountDescription: account.description,
          debit: 0,
          credit: 0,
        },
        { id: "2", accountNumber: "", accountDescription: "", debit: 0, credit: 0 },
      ],
      memo: "",
      reference: "",
    });
    setIsAddEntryOpen(true);
  };

  const handleViewAjeDetail = (account: BridgeAccount, ajeColumn: string) => {
    setSelectedAccount(account);
    setSelectedAjeColumn(ajeColumn);
    setIsDetailDialogOpen(true);
  };

  const getAjeValue = (account: BridgeAccount, ajeKey: string): number | undefined => {
    return account[ajeKey as keyof BridgeAccount] as number | undefined;
  };

  const renderAjeCell = (account: BridgeAccount, ajeKey: string, bgClass: string) => {
    const value = getAjeValue(account, ajeKey);
    const hasValue = value !== undefined && value !== 0;

    return (
      <td
        className={cn(
          "border border-border p-1.5 text-right font-mono relative group cursor-pointer",
          bgClass,
          getCellClass(value),
          hasValue && "hover:bg-primary/10"
        )}
        onClick={() => hasValue && handleViewAjeDetail(account, ajeKey)}
      >
        {formatCurrency(value)}
        {hasValue && (
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 flex items-center justify-end pr-1 bg-gradient-to-l from-primary/20 to-transparent transition-opacity">
            <Eye className="h-3 w-3 text-primary" />
          </div>
        )}
      </td>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Book vs. GAAP Bridge
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              LIVE MARKETING LLC | ASC 842 Operating Lease | Ryobi 920 ST-5 |
              2023/2024/2025
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              onClick={() => {
                setSelectedAccount(null);
                setSelectedAjeColumn(null);
                setNewEntry({
                  ajeNumber: "AJE-10",
                  description: "",
                  period: selectedPeriod as "2023" | "2024",
                  lines: [
                    { id: "1", accountNumber: "", accountDescription: "", debit: 0, credit: 0 },
                    { id: "2", accountNumber: "", accountDescription: "", debit: 0, credit: 0 },
                  ],
                  memo: "",
                  reference: "",
                });
                setIsAddEntryOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Journal Entry
            </Button>
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2023">FY 2023</SelectItem>
                <SelectItem value="2024">FY 2024</SelectItem>
                <SelectItem value="2025">FY 2025</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1 border border-border rounded-md">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setZoom(Math.max(50, zoom - 10))}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-sm w-12 text-center">{zoom}%</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setZoom(Math.min(150, zoom + 10))}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4 mr-2" />
              Filter
            </Button>
            <Button variant="outline" size="sm">
              <Maximize2 className="h-4 w-4 mr-2" />
              Expand
            </Button>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export to Excel
            </Button>
          </div>
        </div>

        {/* Sign Convention Banner */}
        <div className="mt-4 p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground">
          <strong>SIGN CONVENTION:</strong> DR=POSITIVE / CR=NEGATIVE | Each AJE
          column sums to $0 | ROU Amort = IFSC PRINCIPAL (not full payment) |
          AJE-3/7/11: Cr expense / Dr capital per user instruction | QB
          liabilities shown as negative (CR normal balance) |{" "}
          <span className="text-primary font-medium">
            Click any AJE cell to view details or right-click a row to add entries
          </span>
        </div>
      </div>

      {/* Bridge Table */}
      <div className="flex-1 overflow-auto p-4">
        <div
          className="min-w-max"
          style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top left" }}
        >
          <table className="w-full border-collapse text-xs">
            <thead>
              {/* Period Headers */}
              <tr className="bg-slate-800 text-white">
                <th colSpan={4} className="border border-slate-600 p-2 text-left"></th>
                <th
                  colSpan={2}
                  className="border border-slate-600 p-2 text-center bg-blue-800"
                >
                  QB 12/31/2023
                </th>
                <th
                  colSpan={7}
                  className="border border-slate-600 p-2 text-center bg-emerald-800"
                >
                  2023 PRIOR PERIOD AJEs (DR+, CR-, each col nets $0)
                </th>
                <th
                  colSpan={3}
                  className="border border-slate-600 p-2 text-center bg-slate-700"
                >
                  2023 Summary
                </th>
                <th
                  colSpan={6}
                  className="border border-slate-600 p-2 text-center bg-amber-700"
                >
                  2024 CURRENT YEAR AJEs (nets $0)
                </th>
                <th
                  colSpan={3}
                  className="border border-slate-600 p-2 text-center bg-slate-700"
                >
                  2024 Summary
                </th>
              </tr>
              {/* Column Headers */}
              <tr className="bg-slate-700 text-white text-[10px]">
                <th className="border border-slate-600 p-2 text-left w-8">#</th>
                <th className="border border-slate-600 p-2 text-left min-w-[250px]">
                  Account / Description
                </th>
                <th className="border border-slate-600 p-2 text-center w-20">
                  GL Acct #
                </th>
                <th className="border border-slate-600 p-2 text-center w-10">
                  Actions
                </th>
                <th className="border border-slate-600 p-2 text-right w-24 bg-blue-900">
                  Total QB
                  <br />
                  12/31/23
                </th>
                <th className="border border-slate-600 p-2 text-right w-24 bg-blue-900">
                  Ryobi
                  <br />
                  Portion 23
                </th>
                <th className="border border-slate-600 p-2 text-right w-20 bg-emerald-900">
                  AJE-1
                  <br />
                  ROU Setup
                </th>
                <th className="border border-slate-600 p-2 text-right w-20 bg-emerald-900">
                  AJE-2
                  <br />
                  Note—LL
                  <br />
                  Reclass
                </th>
                <th className="border border-slate-600 p-2 text-right w-20 bg-emerald-900">
                  AJE-3
                  <br />
                  Int Rev
                  <br />
                  (Cr/Dr cap)
                </th>
                <th className="border border-slate-600 p-2 text-right w-20 bg-emerald-900">
                  AJE-4
                  <br />
                  OLE Exp
                  <br />
                  →Interim
                </th>
                <th className="border border-slate-600 p-2 text-right w-20 bg-emerald-900">
                  AJE-5
                  <br />
                  ROU Amort
                  <br />
                  =Principal
                </th>
                <th className="border border-slate-600 p-2 text-center w-16 bg-slate-800">
                  2023
                  <br />
                  Net=$0?
                </th>
                <th className="border border-slate-600 p-2 text-right w-24 bg-slate-800">
                  Adj
                  <br />
                  12/31/23
                </th>
                <th className="border border-slate-600 p-2 text-center w-12 bg-slate-800">
                  Chk
                  <br />
                  23
                </th>
                <th className="border border-slate-600 p-2 text-right w-20 bg-amber-800">
                  AJE-6
                  <br />
                  LL Reduc
                </th>
                <th className="border border-slate-600 p-2 text-right w-20 bg-amber-800">
                  AJE-7
                  <br />
                  Int Rev
                  <br />
                  (Cr/Dr cap)
                </th>
                <th className="border border-slate-600 p-2 text-right w-20 bg-amber-800">
                  AJE-8
                  <br />
                  OLE Exp
                  <br />
                  2024
                </th>
                <th className="border border-slate-600 p-2 text-right w-20 bg-amber-800">
                  AJE-9
                  <br />
                  ROU Amort
                  <br />
                  2024
                </th>
                <th className="border border-slate-600 p-2 text-center w-16 bg-slate-800">
                  2024
                  <br />
                  Net=$0?
                </th>
                <th className="border border-slate-600 p-2 text-right w-24 bg-slate-800">
                  Adj
                  <br />
                  12/31/24
                </th>
                <th className="border border-slate-600 p-2 text-center w-12 bg-slate-800">
                  Chk
                  <br />
                  24
                </th>
              </tr>
            </thead>
            <tbody>
              {(["asset", "liability", "equity", "income", "expense"] as const).map(
                (category) => {
                  const accounts = groupedAccounts[category];
                  if (accounts.length === 0) return null;
                  const style = categoryStyles[category];
                  const isExpanded = expandedCategories.has(category);

                  return (
                    <TooltipProvider key={category}>
                      {/* Category Header Row */}
                      <tr
                        className="cursor-pointer"
                        onClick={() => toggleCategory(category)}
                      >
                        <td
                          colSpan={21}
                          className={cn(
                            "border border-slate-400 p-2 font-bold",
                            style.bg,
                            style.text
                          )}
                        >
                          <div className="flex items-center gap-2">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                            {style.label}
                            <Badge
                              variant="secondary"
                              className="ml-2 text-[10px] bg-white/20"
                            >
                              {accounts.length} accounts
                            </Badge>
                          </div>
                        </td>
                      </tr>
                      {/* Account Rows */}
                      {isExpanded &&
                        accounts.map((account, idx) => (
                          <tr
                            key={account.id}
                            className={cn(
                              "hover:bg-muted/50 group",
                              idx % 2 === 0 ? "bg-card" : style.rowBg
                            )}
                          >
                            <td className="border border-border p-1.5 text-center text-muted-foreground">
                              {mockBridgeData.indexOf(account) + 1}
                            </td>
                            <td className="border border-border p-1.5">
                              <div className="flex items-center gap-2">
                                {account.isNew && (
                                  <Badge
                                    variant="destructive"
                                    className="text-[9px] px-1 py-0"
                                  >
                                    NEW
                                  </Badge>
                                )}
                                <span
                                  className={cn(
                                    account.isNew && "text-red-600 font-medium"
                                  )}
                                >
                                  {account.description}
                                </span>
                              </div>
                            </td>
                            <td className="border border-border p-1.5 text-center font-mono">
                              {account.accountNumber}
                            </td>
                            <td className="border border-border p-1.5 text-center">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                                  >
                                    <MoreHorizontal className="h-3.5 w-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => openAddEntryFromRow(account)}
                                  >
                                    <Plus className="h-4 w-4 mr-2" />
                                    Add Journal Entry
                                  </DropdownMenuItem>
                                  <DropdownMenuItem>
                                    <Edit3 className="h-4 w-4 mr-2" />
                                    Edit Account
                                  </DropdownMenuItem>
                                  <DropdownMenuItem>
                                    <MessageSquare className="h-4 w-4 mr-2" />
                                    Add Comment
                                  </DropdownMenuItem>
                                  <DropdownMenuItem>
                                    <Paperclip className="h-4 w-4 mr-2" />
                                    Attach Document
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem>
                                    <Copy className="h-4 w-4 mr-2" />
                                    Copy Row
                                  </DropdownMenuItem>
                                  <DropdownMenuItem>
                                    <FileText className="h-4 w-4 mr-2" />
                                    View History
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </td>
                            <td
                              className={cn(
                                "border border-border p-1.5 text-right font-mono bg-blue-50",
                                getCellClass(account.bookBalance)
                              )}
                            >
                              {formatCurrency(account.bookBalance)}
                            </td>
                            <td
                              className={cn(
                                "border border-border p-1.5 text-right font-mono bg-blue-50",
                                getCellClass(account.ryobiPortion)
                              )}
                            >
                              {formatCurrency(account.ryobiPortion)}
                            </td>
                            {renderAjeCell(account, "aje1", "bg-emerald-50")}
                            {renderAjeCell(account, "aje2", "bg-emerald-50")}
                            {renderAjeCell(account, "aje3", "bg-emerald-50")}
                            {renderAjeCell(account, "aje4", "bg-emerald-50")}
                            {renderAjeCell(account, "aje5", "bg-emerald-50")}
                            <td className="border border-border p-1.5 text-center bg-slate-100">
                              {account.priorPeriodNet === 0 ? (
                                <Check className="h-3.5 w-3.5 text-green-600 mx-auto" />
                              ) : (
                                <AlertCircle className="h-3.5 w-3.5 text-red-500 mx-auto" />
                              )}
                            </td>
                            <td
                              className={cn(
                                "border border-border p-1.5 text-right font-mono bg-slate-100",
                                getCellClass(account.adj2023)
                              )}
                            >
                              {formatCurrency(account.adj2023)}
                            </td>
                            <td className="border border-border p-1.5 text-center bg-slate-100">
                              <Check className="h-3.5 w-3.5 text-green-600 mx-auto" />
                            </td>
                            {renderAjeCell(account, "aje6", "bg-amber-50")}
                            {renderAjeCell(account, "aje7", "bg-amber-50")}
                            {renderAjeCell(account, "aje8", "bg-amber-50")}
                            {renderAjeCell(account, "aje9", "bg-amber-50")}
                            <td className="border border-border p-1.5 text-center bg-slate-100">
                              {account.currentYearNet === 0 ? (
                                <Check className="h-3.5 w-3.5 text-green-600 mx-auto" />
                              ) : account.currentYearNet !== undefined ? (
                                <AlertCircle className="h-3.5 w-3.5 text-red-500 mx-auto" />
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td
                              className={cn(
                                "border border-border p-1.5 text-right font-mono bg-slate-100",
                                getCellClass(account.adj2024)
                              )}
                            >
                              {formatCurrency(account.adj2024)}
                            </td>
                            <td className="border border-border p-1.5 text-center bg-slate-100">
                              {account.adj2024 !== undefined ? (
                                <Check className="h-3.5 w-3.5 text-green-600 mx-auto" />
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                    </TooltipProvider>
                  );
                }
              )}
              {/* Totals Row */}
              <tr className="bg-slate-200 font-bold">
                <td colSpan={4} className="border border-slate-400 p-2 text-right">
                  AJE COLUMN TOTALS — EACH MUST NET $0
                </td>
                <td
                  className={cn(
                    "border border-slate-400 p-2 text-right font-mono",
                    getCellClass(columnTotals.bookBalance)
                  )}
                >
                  {formatCurrency(columnTotals.bookBalance)}
                </td>
                <td
                  className={cn(
                    "border border-slate-400 p-2 text-right font-mono",
                    getCellClass(columnTotals.ryobiPortion)
                  )}
                >
                  {formatCurrency(columnTotals.ryobiPortion)}
                </td>
                <td className="border border-slate-400 p-2 text-center">
                  {isColumnBalanced(columnTotals.aje1) ? (
                    <Tooltip>
                      <TooltipTrigger>
                        <Check className="h-4 w-4 text-green-600 mx-auto" />
                      </TooltipTrigger>
                      <TooltipContent>Balanced: $0.00</TooltipContent>
                    </Tooltip>
                  ) : (
                    <span className="text-red-600">
                      {formatCurrency(columnTotals.aje1)}
                    </span>
                  )}
                </td>
                <td className="border border-slate-400 p-2 text-center">
                  {isColumnBalanced(columnTotals.aje2) ? (
                    <Check className="h-4 w-4 text-green-600 mx-auto" />
                  ) : (
                    <span className="text-red-600">
                      {formatCurrency(columnTotals.aje2)}
                    </span>
                  )}
                </td>
                <td className="border border-slate-400 p-2 text-center">
                  {isColumnBalanced(columnTotals.aje3) ? (
                    <Check className="h-4 w-4 text-green-600 mx-auto" />
                  ) : (
                    <span className="text-red-600">
                      {formatCurrency(columnTotals.aje3)}
                    </span>
                  )}
                </td>
                <td className="border border-slate-400 p-2 text-center">
                  {isColumnBalanced(columnTotals.aje4) ? (
                    <Check className="h-4 w-4 text-green-600 mx-auto" />
                  ) : (
                    <span className="text-red-600">
                      {formatCurrency(columnTotals.aje4)}
                    </span>
                  )}
                </td>
                <td className="border border-slate-400 p-2 text-center">
                  {isColumnBalanced(columnTotals.aje5) ? (
                    <Check className="h-4 w-4 text-green-600 mx-auto" />
                  ) : (
                    <span className="text-red-600">
                      {formatCurrency(columnTotals.aje5)}
                    </span>
                  )}
                </td>
                <td
                  colSpan={3}
                  className="border border-slate-400 p-2 text-center bg-green-100"
                >
                  <div className="flex items-center justify-center gap-2">
                    <Check className="h-4 w-4 text-green-600" />
                    <span className="text-green-700">2023 Balanced</span>
                  </div>
                </td>
                <td className="border border-slate-400 p-2 text-center">
                  {isColumnBalanced(columnTotals.aje6) ? (
                    <Check className="h-4 w-4 text-green-600 mx-auto" />
                  ) : (
                    <span className="text-red-600">
                      {formatCurrency(columnTotals.aje6)}
                    </span>
                  )}
                </td>
                <td className="border border-slate-400 p-2 text-center">
                  {isColumnBalanced(columnTotals.aje7) ? (
                    <Check className="h-4 w-4 text-green-600 mx-auto" />
                  ) : (
                    <span className="text-red-600">
                      {formatCurrency(columnTotals.aje7)}
                    </span>
                  )}
                </td>
                <td className="border border-slate-400 p-2 text-center">
                  {isColumnBalanced(columnTotals.aje8) ? (
                    <Check className="h-4 w-4 text-green-600 mx-auto" />
                  ) : (
                    <span className="text-red-600">
                      {formatCurrency(columnTotals.aje8)}
                    </span>
                  )}
                </td>
                <td className="border border-slate-400 p-2 text-center">
                  {isColumnBalanced(columnTotals.aje9) ? (
                    <Check className="h-4 w-4 text-green-600 mx-auto" />
                  ) : (
                    <span className="text-red-600">
                      {formatCurrency(columnTotals.aje9)}
                    </span>
                  )}
                </td>
                <td
                  colSpan={3}
                  className="border border-slate-400 p-2 text-center bg-green-100"
                >
                  <div className="flex items-center justify-center gap-2">
                    <Check className="h-4 w-4 text-green-600" />
                    <span className="text-green-700">2024 Balanced</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer Summary */}
      <div className="border-t border-border bg-card px-6 py-3">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-blue-600"></div>
              <span className="text-muted-foreground">Assets</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-orange-500"></div>
              <span className="text-muted-foreground">Liabilities</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-yellow-400"></div>
              <span className="text-muted-foreground">Equity</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-green-700"></div>
              <span className="text-muted-foreground">P&L</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Badge variant="outline" className="gap-1">
              <Check className="h-3 w-3 text-green-600" />9 AJEs Posted
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Plus className="h-3 w-3 text-red-500" />6 NEW Accounts
            </Badge>
          </div>
        </div>
      </div>

      {/* Add Journal Entry Sheet */}
      <Sheet open={isAddEntryOpen} onOpenChange={setIsAddEntryOpen}>
        <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {selectedAccount
                ? `Add Entry for ${selectedAccount.accountNumber}`
                : "New Journal Entry"}
            </SheetTitle>
            <SheetDescription>
              Create a new adjusting journal entry. All entries must balance (DR = CR).
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            {/* Entry Header */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ajeNumber">AJE Number</Label>
                <Input
                  id="ajeNumber"
                  value={newEntry.ajeNumber}
                  onChange={(e) =>
                    setNewEntry({ ...newEntry, ajeNumber: e.target.value })
                  }
                  placeholder="AJE-10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="period">Period</Label>
                <Select
                  value={newEntry.period}
                  onValueChange={(v) =>
                    setNewEntry({ ...newEntry, period: v as "2023" | "2024" })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2023">2023 Prior Period</SelectItem>
                    <SelectItem value="2024">2024 Current Year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={newEntry.description}
                onChange={(e) =>
                  setNewEntry({ ...newEntry, description: e.target.value })
                }
                placeholder="e.g., Record operating lease expense"
              />
            </div>

            {/* Journal Entry Lines */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Entry Lines</Label>
                <Button variant="outline" size="sm" onClick={handleAddLine}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Line
                </Button>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="p-2 text-left font-medium">Account</th>
                      <th className="p-2 text-right font-medium w-28">Debit</th>
                      <th className="p-2 text-right font-medium w-28">Credit</th>
                      <th className="p-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {newEntry.lines.map((line, idx) => (
                      <tr key={line.id} className="border-t">
                        <td className="p-2">
                          <Select
                            value={line.accountNumber}
                            onValueChange={(v) => handleAccountSelect(line.id, v)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Select account..." />
                            </SelectTrigger>
                            <SelectContent>
                              {availableAccounts.map((acc) => (
                                <SelectItem key={acc.number} value={acc.number}>
                                  <span className="font-mono">{acc.number}</span> -{" "}
                                  {acc.description.slice(0, 30)}
                                  {acc.description.length > 30 ? "..." : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            className="h-8 text-right text-xs"
                            value={line.debit || ""}
                            onChange={(e) =>
                              handleLineChange(
                                line.id,
                                "debit",
                                parseFloat(e.target.value) || 0
                              )
                            }
                            placeholder="0.00"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            className="h-8 text-right text-xs"
                            value={line.credit || ""}
                            onChange={(e) =>
                              handleLineChange(
                                line.id,
                                "credit",
                                parseFloat(e.target.value) || 0
                              )
                            }
                            placeholder="0.00"
                          />
                        </td>
                        <td className="p-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => handleRemoveLine(line.id)}
                            disabled={newEntry.lines.length <= 2}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/50 font-medium">
                    <tr className="border-t">
                      <td className="p-2 text-right">Totals:</td>
                      <td className="p-2 text-right font-mono">
                        ${totalDebits.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2 text-right font-mono">
                        ${totalCredits.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2">
                        {isBalanced ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-red-500" />
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {!isBalanced && (
                <p className="text-sm text-red-500">
                  Entry is out of balance by $
                  {Math.abs(totalDebits - totalCredits).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                  })}
                </p>
              )}
            </div>

            {/* Memo and Reference */}
            <div className="space-y-2">
              <Label htmlFor="memo">Memo / Notes</Label>
              <Textarea
                id="memo"
                value={newEntry.memo}
                onChange={(e) => setNewEntry({ ...newEntry, memo: e.target.value })}
                placeholder="Add any notes or supporting details..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reference">Workpaper Reference</Label>
              <Input
                id="reference"
                value={newEntry.reference}
                onChange={(e) => setNewEntry({ ...newEntry, reference: e.target.value })}
                placeholder="e.g., WP-ASC842-001"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t">
              <Button className="flex-1" disabled={!isBalanced}>
                <Check className="h-4 w-4 mr-2" />
                Post Entry
              </Button>
              <Button variant="outline" onClick={() => setIsAddEntryOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* AJE Detail Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {selectedAjeColumn?.toUpperCase().replace("AJE", "AJE-")} Detail
            </DialogTitle>
            <DialogDescription>
              Journal entry detail for {selectedAccount?.description}
            </DialogDescription>
          </DialogHeader>

          {selectedAccount && selectedAjeColumn && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Account</p>
                  <p className="font-mono font-medium">
                    {selectedAccount.accountNumber}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Amount</p>
                  <p
                    className={cn(
                      "font-mono font-medium",
                      getCellClass(getAjeValue(selectedAccount, selectedAjeColumn))
                    )}
                  >
                    {formatCurrency(getAjeValue(selectedAccount, selectedAjeColumn))}
                  </p>
                </div>
              </div>

              <div className="border rounded-lg p-4 bg-muted/30">
                <p className="text-sm font-medium mb-2">Entry Description</p>
                <p className="text-sm text-muted-foreground">
                  {selectedAjeColumn === "aje1" && "ROU Asset Setup - Initial recognition of right-of-use asset"}
                  {selectedAjeColumn === "aje2" && "Note Liability Reclass - Remove IFSC note from books"}
                  {selectedAjeColumn === "aje3" && "Interest Revenue Recognition - Cr expense / Dr capital"}
                  {selectedAjeColumn === "aje4" && "Operating Lease Expense - Interim period adjustment"}
                  {selectedAjeColumn === "aje5" && "ROU Amortization - Principal portion of lease payment"}
                  {selectedAjeColumn === "aje6" && "Lease Liability Reduction - 2024 payment application"}
                  {selectedAjeColumn === "aje7" && "Interest Revenue Recognition - 2024 Cr expense / Dr capital"}
                  {selectedAjeColumn === "aje8" && "Operating Lease Expense - 2024 annual expense"}
                  {selectedAjeColumn === "aje9" && "ROU Amortization - 2024 principal amortization"}
                </p>
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Paperclip className="h-4 w-4" />
                <span>2 supporting documents attached</span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetailDialogOpen(false)}>
              Close
            </Button>
            <Button
              onClick={() => {
                setIsDetailDialogOpen(false);
                if (selectedAccount) {
                  openAddEntryFromRow(selectedAccount, selectedAjeColumn || undefined);
                }
              }}
            >
              <Edit3 className="h-4 w-4 mr-2" />
              Edit Entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
