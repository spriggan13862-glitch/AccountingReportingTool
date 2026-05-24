"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  Upload,
  FileSpreadsheet,
  GitBranch,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  ArrowRight,
} from "lucide-react"
import { chartOfAccounts, getJEBatches, validationIssues } from "@/lib/mock-data"

interface DashboardProps {
  onNavigate: (screen: string) => void
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const batches = getJEBatches()
  const unmappedAccounts = chartOfAccounts.filter((a) => !a.taxonomyCategory && a.active).length
  const totalActive = chartOfAccounts.filter((a) => a.active).length
  const mappingProgress = Math.round(((totalActive - unmappedAccounts) / totalActive) * 100)

  const draftEntries = batches.filter((b) => b.status === "Draft").length
  const pendingReview = batches.filter((b) => b.status === "Ready for Review").length
  const postedEntries = batches.filter((b) => b.status === "Posted").length

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const totalAdjustments = batches
    .filter((b) => b.status === "Posted")
    .reduce((sum, b) => sum + b.totalDebit, 0)

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Overview for Sunrise Coffee Co. - December 2024
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Accounts Mapped</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{mappingProgress}%</p>
                <p className="text-xs text-muted-foreground">{unmappedAccounts} remaining</p>
              </div>
              <div className={`rounded-full p-2 ${unmappedAccounts > 0 ? "bg-warning/10" : "bg-success/10"}`}>
                <GitBranch className={`size-5 ${unmappedAccounts > 0 ? "text-warning" : "text-success"}`} />
              </div>
            </div>
            <Progress value={mappingProgress} className="mt-3 h-1.5" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Draft Entries</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{draftEntries}</p>
                <p className="text-xs text-muted-foreground">{pendingReview} pending review</p>
              </div>
              <div className="rounded-full p-2 bg-muted">
                <FileSpreadsheet className="size-5 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Posted Adjustments</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{postedEntries}</p>
                <p className="text-xs text-muted-foreground">{formatCurrency(totalAdjustments)} total</p>
              </div>
              <div className="rounded-full p-2 bg-success/10">
                <CheckCircle2 className="size-5 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Validation Issues</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{validationIssues.length}</p>
                <p className="text-xs text-muted-foreground">
                  {validationIssues.filter((i) => i.type === "error").length} errors
                </p>
              </div>
              <div className="rounded-full p-2 bg-destructive/10">
                <AlertTriangle className="size-5 text-destructive" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Workflow Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cleanup Workflow</CardTitle>
          <CardDescription className="text-xs">
            Track your progress through the books cleanup process
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1">
              <div className="flex flex-col items-center gap-1">
                <div className="rounded-full p-2 bg-success/10">
                  <Upload className="size-4 text-success" />
                </div>
                <span className="text-xs font-medium">Import</span>
                <Badge variant="outline" className="text-[10px] text-success">Done</Badge>
              </div>
              <div className="flex-1 h-0.5 bg-success" />
              <div className="flex flex-col items-center gap-1">
                <div className="rounded-full p-2 bg-success/10">
                  <CheckCircle2 className="size-4 text-success" />
                </div>
                <span className="text-xs font-medium">Validate</span>
                <Badge variant="outline" className="text-[10px] text-warning">Issues</Badge>
              </div>
              <div className="flex-1 h-0.5 bg-border" />
              <div className="flex flex-col items-center gap-1">
                <div className="rounded-full p-2 bg-warning/10">
                  <GitBranch className="size-4 text-warning" />
                </div>
                <span className="text-xs font-medium">Map</span>
                <Badge variant="outline" className="text-[10px]">{mappingProgress}%</Badge>
              </div>
              <div className="flex-1 h-0.5 bg-border" />
              <div className="flex flex-col items-center gap-1">
                <div className="rounded-full p-2 bg-muted">
                  <FileSpreadsheet className="size-4 text-muted-foreground" />
                </div>
                <span className="text-xs font-medium">Adjust</span>
                <Badge variant="outline" className="text-[10px]">{draftEntries + postedEntries}</Badge>
              </div>
              <div className="flex-1 h-0.5 bg-border" />
              <div className="flex flex-col items-center gap-1">
                <div className="rounded-full p-2 bg-muted">
                  <TrendingUp className="size-4 text-muted-foreground" />
                </div>
                <span className="text-xs font-medium">Report</span>
                <Badge variant="outline" className="text-[10px]">Preview</Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="hover:border-primary/50 cursor-pointer transition-colors" onClick={() => onNavigate("imports")}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg p-2 bg-chart-1/10">
                  <Upload className="size-5 text-chart-1" />
                </div>
                <div>
                  <p className="font-medium text-sm">Import Data</p>
                  <p className="text-xs text-muted-foreground">Upload trial balance or GL</p>
                </div>
              </div>
              <ArrowRight className="size-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="hover:border-primary/50 cursor-pointer transition-colors" onClick={() => onNavigate("taxonomy")}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg p-2 bg-warning/10">
                  <GitBranch className="size-5 text-warning" />
                </div>
                <div>
                  <p className="font-medium text-sm">Map Accounts</p>
                  <p className="text-xs text-muted-foreground">{unmappedAccounts} accounts unmapped</p>
                </div>
              </div>
              <ArrowRight className="size-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="hover:border-primary/50 cursor-pointer transition-colors" onClick={() => onNavigate("journal-entries")}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg p-2 bg-chart-2/10">
                  <FileSpreadsheet className="size-5 text-chart-2" />
                </div>
                <div>
                  <p className="font-medium text-sm">Journal Entries</p>
                  <p className="text-xs text-muted-foreground">{pendingReview} pending review</p>
                </div>
              </div>
              <ArrowRight className="size-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <div className="rounded-full p-1.5 bg-success/10">
              <CheckCircle2 className="size-3 text-success" />
            </div>
            <span className="flex-1">AJE-2024-001 posted by Mike Chen</span>
            <span className="text-xs text-muted-foreground">2 hours ago</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className="rounded-full p-1.5 bg-chart-1/10">
              <FileSpreadsheet className="size-3 text-chart-1" />
            </div>
            <span className="flex-1">AJE-2024-004 created by Sarah Johnson</span>
            <span className="text-xs text-muted-foreground">3 hours ago</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className="rounded-full p-1.5 bg-warning/10">
              <Clock className="size-3 text-warning" />
            </div>
            <span className="flex-1">AJE-2024-003 submitted for review</span>
            <span className="text-xs text-muted-foreground">5 hours ago</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className="rounded-full p-1.5 bg-muted">
              <Upload className="size-3 text-muted-foreground" />
            </div>
            <span className="flex-1">TB_Dec2024_SunriseCoffee.xlsx imported</span>
            <span className="text-xs text-muted-foreground">Yesterday</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
