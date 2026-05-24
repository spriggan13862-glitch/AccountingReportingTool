"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Send,
  FileText,
  MessageSquare,
} from "lucide-react"
import { getJEBatches, type JournalEntry } from "@/lib/mock-data"

const statusConfig: Record<JournalEntry["status"], { color: string; bgColor: string }> = {
  "Draft": { color: "text-muted-foreground", bgColor: "bg-muted" },
  "Ready for Review": { color: "text-warning-foreground", bgColor: "bg-warning/10" },
  "Reviewed": { color: "text-chart-1", bgColor: "bg-chart-1/10" },
  "Posted": { color: "text-success", bgColor: "bg-success/10" },
  "Rejected": { color: "text-destructive", bgColor: "bg-destructive/10" },
}

type ValidationCheck = {
  id: string
  label: string
  passed: boolean
}

export function DraftReviewQueue() {
  const [selectedBatches, setSelectedBatches] = useState<Set<string>>(new Set())
  const [showPostModal, setShowPostModal] = useState(false)

  const batches = getJEBatches()

  const groupedBatches = {
    draft: batches.filter((b) => b.status === "Draft"),
    readyForReview: batches.filter((b) => b.status === "Ready for Review"),
    reviewed: batches.filter((b) => b.status === "Reviewed"),
    posted: batches.filter((b) => b.status === "Posted"),
    rejected: batches.filter((b) => b.status === "Rejected"),
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(amount)
  }

  const toggleBatch = (jeNumber: string) => {
    const newSelected = new Set(selectedBatches)
    if (newSelected.has(jeNumber)) {
      newSelected.delete(jeNumber)
    } else {
      newSelected.add(jeNumber)
    }
    setSelectedBatches(newSelected)
  }

  const validationChecks: ValidationCheck[] = [
    { id: "1", label: "Debits equal credits", passed: true },
    { id: "2", label: "Period is open", passed: true },
    { id: "3", label: "All accounts mapped", passed: true },
    { id: "4", label: "No missing descriptions", passed: true },
    { id: "5", label: "Support attached", passed: false },
  ]

  const renderBatchTable = (batchList: typeof batches, title: string, emptyMessage: string) => (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <Badge variant="outline">{batchList.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {batchList.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[40px]"></TableHead>
                <TableHead className="text-xs">JE #</TableHead>
                <TableHead className="text-xs">Description</TableHead>
                <TableHead className="text-xs text-right">Debit</TableHead>
                <TableHead className="text-xs text-right">Credit</TableHead>
                <TableHead className="text-xs">Prepared</TableHead>
                <TableHead className="text-xs">Reviewed</TableHead>
                <TableHead className="text-xs"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batchList.map((batch) => (
                <TableRow key={batch.jeNumber}>
                  <TableCell>
                    {(batch.status === "Reviewed" || batch.status === "Ready for Review") && (
                      <Checkbox
                        checked={selectedBatches.has(batch.jeNumber)}
                        onCheckedChange={() => toggleBatch(batch.jeNumber)}
                      />
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-sm font-medium">{batch.jeNumber}</TableCell>
                  <TableCell className="text-sm max-w-[200px] truncate">{batch.description}</TableCell>
                  <TableCell className="text-sm text-right font-mono">{formatCurrency(batch.totalDebit)}</TableCell>
                  <TableCell className="text-sm text-right font-mono">{formatCurrency(batch.totalCredit)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{batch.preparedBy}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{batch.reviewedBy || "-"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {batch.hasSupport && <FileText className="size-3 text-muted-foreground" />}
                      {batch.comments.length > 0 && <MessageSquare className="size-3 text-muted-foreground" />}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</div>
        )}
      </CardContent>
    </Card>
  )

  const selectedReviewedBatches = Array.from(selectedBatches)
    .map((jeNum) => batches.find((b) => b.jeNumber === jeNum))
    .filter(Boolean)

  const totalSelectedDebit = selectedReviewedBatches.reduce((sum, b) => sum + (b?.totalDebit || 0), 0)
  const totalSelectedCredit = selectedReviewedBatches.reduce((sum, b) => sum + (b?.totalCredit || 0), 0)

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Draft Review Queue</h1>
          <p className="text-sm text-muted-foreground">Review and post adjusting journal entries</p>
        </div>
        {selectedBatches.size > 0 && (
          <Button onClick={() => setShowPostModal(true)}>
            <Send className="size-4 mr-2" />
            Post Selected ({selectedBatches.size})
          </Button>
        )}
      </div>

      {/* Warning Banner */}
      <Card className="bg-warning/5 border-warning/30">
        <CardContent className="py-3">
          <div className="flex items-center gap-3">
            <AlertTriangle className="size-5 text-warning" />
            <div>
              <p className="text-sm font-medium">Draft entries are preview-only</p>
              <p className="text-xs text-muted-foreground">
                Only posted entries affect official reports. Draft and pending entries are shown in pro-forma previews only.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Status Groups */}
      <div className="grid grid-cols-2 gap-6">
        {renderBatchTable(groupedBatches.draft, "Draft", "No draft entries")}
        {renderBatchTable(groupedBatches.readyForReview, "Ready for Review", "No entries pending review")}
        {renderBatchTable(groupedBatches.reviewed, "Reviewed - Ready to Post", "No reviewed entries")}
        {renderBatchTable(groupedBatches.rejected, "Rejected", "No rejected entries")}
      </div>

      {/* Posted Summary */}
      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-medium">Posted Entries</CardTitle>
              <CardDescription className="text-xs">These entries are now part of official records</CardDescription>
            </div>
            <Badge variant="outline" className="text-success border-success/30 bg-success/10">
              {groupedBatches.posted.length} Posted
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {groupedBatches.posted.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs">JE #</TableHead>
                  <TableHead className="text-xs">Description</TableHead>
                  <TableHead className="text-xs text-right">Debit</TableHead>
                  <TableHead className="text-xs text-right">Credit</TableHead>
                  <TableHead className="text-xs">Posted By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedBatches.posted.map((batch) => (
                  <TableRow key={batch.jeNumber}>
                    <TableCell className="font-mono text-sm font-medium">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="size-4 text-success" />
                        {batch.jeNumber}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{batch.description}</TableCell>
                    <TableCell className="text-sm text-right font-mono">{formatCurrency(batch.totalDebit)}</TableCell>
                    <TableCell className="text-sm text-right font-mono">{formatCurrency(batch.totalCredit)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{batch.reviewedBy}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">No posted entries yet</div>
          )}
        </CardContent>
      </Card>

      {/* Post Confirmation Modal */}
      <Dialog open={showPostModal} onOpenChange={setShowPostModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Post Journal Entries</DialogTitle>
            <DialogDescription>
              You are about to post {selectedBatches.size} journal {selectedBatches.size === 1 ? "entry" : "entries"}.
              This action will affect official financial reports.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Batch Summary */}
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium">Batch Summary</span>
                <Badge variant="secondary">{selectedBatches.size} entries</Badge>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs text-muted-foreground">Total Debits</span>
                  <p className="text-lg font-semibold font-mono">{formatCurrency(totalSelectedDebit)}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Total Credits</span>
                  <p className="text-lg font-semibold font-mono">{formatCurrency(totalSelectedCredit)}</p>
                </div>
              </div>
            </div>

            {/* Validation Checks */}
            <div>
              <span className="text-sm font-medium mb-2 block">Validation Checks</span>
              <div className="space-y-2">
                {validationChecks.map((check) => (
                  <div key={check.id} className="flex items-center gap-2">
                    {check.passed ? (
                      <CheckCircle2 className="size-4 text-success" />
                    ) : (
                      <XCircle className="size-4 text-warning" />
                    )}
                    <span className={`text-sm ${check.passed ? "text-foreground" : "text-warning-foreground"}`}>
                      {check.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Warning */}
            <div className="rounded-lg bg-warning/10 p-3 flex items-start gap-2">
              <AlertTriangle className="size-4 text-warning mt-0.5" />
              <div>
                <p className="text-sm font-medium text-warning-foreground">Important</p>
                <p className="text-xs text-muted-foreground">
                  Posted entries cannot be edited. To make corrections, you will need to create reversing entries.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPostModal(false)}>
              Cancel
            </Button>
            <Button className="bg-success hover:bg-success/90" onClick={() => setShowPostModal(false)}>
              <CheckCircle2 className="size-4 mr-2" />
              Confirm Post
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
