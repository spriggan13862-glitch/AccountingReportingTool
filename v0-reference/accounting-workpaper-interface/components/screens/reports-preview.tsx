"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Download,
  Printer,
  AlertTriangle,
  ChevronRight,
  TrendingUp,
  TrendingDown,
} from "lucide-react"
import { trialBalanceData, incomeStatementData, type ReportLine } from "@/lib/mock-data"

export function ReportsPreview() {
  const [includeDraft, setIncludeDraft] = useState(true)
  const [activeReport, setActiveReport] = useState("trial-balance")

  const formatCurrency = (amount: number) => {
    const formatted = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(Math.abs(amount))
    return amount < 0 ? `(${formatted})` : formatted
  }

  const getImpactBadge = (amount: number) => {
    if (amount === 0) return null
    const isPositive = amount > 0
    return (
      <Badge
        variant="outline"
        className={`text-xs ${
          isPositive
            ? "text-success border-success/30 bg-success/10"
            : "text-destructive border-destructive/30 bg-destructive/10"
        }`}
      >
        {isPositive ? <TrendingUp className="size-3 mr-1" /> : <TrendingDown className="size-3 mr-1" />}
        {formatCurrency(amount)}
      </Badge>
    )
  }

  const renderReportTable = (data: ReportLine[], title: string) => (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            {includeDraft && (
              <CardDescription className="flex items-center gap-1 text-warning-foreground">
                <AlertTriangle className="size-3" />
                Preview / Pro Forma — Includes Draft Adjustments
              </CardDescription>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Printer className="size-4 mr-2" />
              Print
            </Button>
            <Button variant="outline" size="sm">
              <Download className="size-4 mr-2" />
              Export
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-xs w-[250px]">Line Item</TableHead>
              <TableHead className="text-xs text-right">Imported Balance</TableHead>
              <TableHead className="text-xs text-right">Posted Adj.</TableHead>
              {includeDraft && (
                <TableHead className="text-xs text-right">Draft Adj.</TableHead>
              )}
              <TableHead className="text-xs text-right">Adjusted Balance</TableHead>
              <TableHead className="text-xs text-right">Impact</TableHead>
              <TableHead className="text-xs w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((line) => {
              const totalAdjustments = includeDraft
                ? line.postedAdjustments + line.draftAdjustments
                : line.postedAdjustments
              const adjustedBalance = line.importedBalance + totalAdjustments
              const isSummary = line.accounts.length === 0

              return (
                <TableRow
                  key={line.id}
                  className={`${isSummary ? "font-medium bg-muted/50" : "cursor-pointer hover:bg-muted/30"}`}
                >
                  <TableCell className={`text-sm ${isSummary ? "font-semibold" : ""}`}>
                    {line.lineItem}
                  </TableCell>
                  <TableCell className="text-sm text-right font-mono">
                    {formatCurrency(line.importedBalance)}
                  </TableCell>
                  <TableCell className="text-sm text-right font-mono">
                    {line.postedAdjustments !== 0 ? (
                      <span className={line.postedAdjustments > 0 ? "text-success" : "text-destructive"}>
                        {formatCurrency(line.postedAdjustments)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  {includeDraft && (
                    <TableCell className="text-sm text-right font-mono">
                      {line.draftAdjustments !== 0 ? (
                        <span className="text-warning-foreground italic">
                          {formatCurrency(line.draftAdjustments)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  )}
                  <TableCell className="text-sm text-right font-mono font-medium">
                    {formatCurrency(adjustedBalance)}
                  </TableCell>
                  <TableCell className="text-right">
                    {!isSummary && getImpactBadge(totalAdjustments)}
                  </TableCell>
                  <TableCell>
                    {!isSummary && line.accounts.length > 0 && (
                      <ChevronRight className="size-4 text-muted-foreground" />
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )

  // Calculate balance sheet data from trial balance
  const assetsTotal = trialBalanceData.find((l) => l.lineItem === "Total Assets")
  const liabilitiesData: ReportLine[] = [
    { id: "l1", lineItem: "Accounts Payable", level: 0, importedBalance: 18500.00, postedAdjustments: 0, draftAdjustments: 0, adjustedBalance: 18500.00, accounts: ["2000"] },
    { id: "l2", lineItem: "Accrued Liabilities", level: 0, importedBalance: 11200.00, postedAdjustments: 0, draftAdjustments: 4250, adjustedBalance: 15450.00, accounts: ["2100", "2110"] },
    { id: "l3", lineItem: "Other Current Liabilities", level: 0, importedBalance: 3200.00, postedAdjustments: 0, draftAdjustments: 0, adjustedBalance: 3200.00, accounts: ["2200"] },
    { id: "l4", lineItem: "Long-term Debt", level: 0, importedBalance: 35000.00, postedAdjustments: 0, draftAdjustments: 0, adjustedBalance: 35000.00, accounts: ["2500"] },
    { id: "l5", lineItem: "Total Liabilities", level: 0, importedBalance: 67900.00, postedAdjustments: 0, draftAdjustments: 4250, adjustedBalance: 72150.00, accounts: [] },
    { id: "e1", lineItem: "Stockholders Equity", level: 0, importedBalance: 50000.00, postedAdjustments: 0, draftAdjustments: 0, adjustedBalance: 50000.00, accounts: ["3000"] },
    { id: "e2", lineItem: "Retained Earnings", level: 0, importedBalance: 42575.50, postedAdjustments: -4416.67, draftAdjustments: -5675, adjustedBalance: 32483.83, accounts: ["3100"] },
    { id: "e3", lineItem: "Total Equity", level: 0, importedBalance: 92575.50, postedAdjustments: -4416.67, draftAdjustments: -5675, adjustedBalance: 82483.83, accounts: [] },
    { id: "te", lineItem: "Total Liabilities & Equity", level: 0, importedBalance: 160475.50, postedAdjustments: -4416.67, draftAdjustments: -1425, adjustedBalance: 154633.83, accounts: [] },
  ]

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Reports Preview</h1>
          <p className="text-sm text-muted-foreground">Preview financial statements with adjustment impact</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="include-draft"
              checked={includeDraft}
              onCheckedChange={setIncludeDraft}
            />
            <Label htmlFor="include-draft" className="text-sm">
              Include Draft Adjustments
            </Label>
          </div>
        </div>
      </div>

      {/* Draft Warning Banner */}
      {includeDraft && (
        <Card className="bg-warning/5 border-warning/30">
          <CardContent className="py-3">
            <div className="flex items-center gap-3">
              <AlertTriangle className="size-5 text-warning" />
              <div>
                <p className="text-sm font-medium text-warning-foreground">Pro Forma View Active</p>
                <p className="text-xs text-muted-foreground">
                  Reports below include draft adjustments that have not been posted. These figures are for preview purposes only.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Report Tabs */}
      <Tabs value={activeReport} onValueChange={setActiveReport} className="flex-1">
        <TabsList>
          <TabsTrigger value="trial-balance">Trial Balance</TabsTrigger>
          <TabsTrigger value="income-statement">Income Statement</TabsTrigger>
          <TabsTrigger value="balance-sheet">Balance Sheet</TabsTrigger>
        </TabsList>

        <TabsContent value="trial-balance" className="mt-4">
          {renderReportTable(trialBalanceData, "Draft-Adjusted Trial Balance")}
        </TabsContent>

        <TabsContent value="income-statement" className="mt-4">
          {renderReportTable(incomeStatementData, "Income Statement")}
        </TabsContent>

        <TabsContent value="balance-sheet" className="mt-4">
          <div className="grid grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Assets</CardTitle>
                {includeDraft && (
                  <CardDescription className="flex items-center gap-1 text-warning-foreground text-xs">
                    <AlertTriangle className="size-3" />
                    Pro Forma — Includes Draft
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs">Line Item</TableHead>
                      <TableHead className="text-xs text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trialBalanceData.map((line) => {
                      const adjustedBalance = includeDraft
                        ? line.importedBalance + line.postedAdjustments + line.draftAdjustments
                        : line.importedBalance + line.postedAdjustments
                      const isSummary = line.accounts.length === 0
                      return (
                        <TableRow key={line.id} className={isSummary ? "font-medium bg-muted/50" : ""}>
                          <TableCell className={`text-sm ${isSummary ? "font-semibold" : ""}`}>
                            {line.lineItem}
                          </TableCell>
                          <TableCell className="text-sm text-right font-mono">
                            {formatCurrency(adjustedBalance)}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Liabilities & Equity</CardTitle>
                {includeDraft && (
                  <CardDescription className="flex items-center gap-1 text-warning-foreground text-xs">
                    <AlertTriangle className="size-3" />
                    Pro Forma — Includes Draft
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs">Line Item</TableHead>
                      <TableHead className="text-xs text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {liabilitiesData.map((line) => {
                      const adjustedBalance = includeDraft
                        ? line.importedBalance + line.postedAdjustments + line.draftAdjustments
                        : line.importedBalance + line.postedAdjustments
                      const isSummary = line.accounts.length === 0
                      return (
                        <TableRow key={line.id} className={isSummary ? "font-medium bg-muted/50" : ""}>
                          <TableCell className={`text-sm ${isSummary ? "font-semibold" : ""}`}>
                            {line.lineItem}
                          </TableCell>
                          <TableCell className="text-sm text-right font-mono">
                            {formatCurrency(adjustedBalance)}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
