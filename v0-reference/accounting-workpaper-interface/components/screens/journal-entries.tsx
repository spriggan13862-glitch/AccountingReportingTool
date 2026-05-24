"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Search,
  Filter,
  Download,
  Plus,
  Upload,
  MoreHorizontal,
  Copy,
  RotateCcw,
  Send,
  CheckCircle2,
  FileText,
  MessageSquare,
  History,
  AlertTriangle,
  Paperclip,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { journalEntries, adjustmentTypes, jeStatuses, getJEBatches, chartOfAccounts, type JournalEntry } from "@/lib/mock-data"

const statusConfig: Record<JournalEntry["status"], { color: string; bgColor: string }> = {
  "Draft": { color: "text-muted-foreground", bgColor: "bg-muted" },
  "Ready for Review": { color: "text-warning-foreground", bgColor: "bg-warning/10" },
  "Reviewed": { color: "text-chart-1", bgColor: "bg-chart-1/10" },
  "Posted": { color: "text-success", bgColor: "bg-success/10" },
  "Rejected": { color: "text-destructive", bgColor: "bg-destructive/10" },
}

export function JournalEntriesWorkspace() {
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [selectedEntry, setSelectedEntry] = useState<string | null>(null)
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<"lines" | "batches">("batches")

  const batches = getJEBatches()

  const filteredEntries = journalEntries.filter((entry) => {
    const matchesSearch =
      entry.jeNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.accountName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.description.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === "all" || entry.status === statusFilter
    const matchesType = typeFilter === "all" || entry.adjustmentType === typeFilter
    return matchesSearch && matchesStatus && matchesType
  })

  const filteredBatches = batches.filter((batch) => {
    const matchesSearch =
      batch.jeNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      batch.description.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === "all" || batch.status === statusFilter
    const matchesType = typeFilter === "all" || batch.adjustmentType === typeFilter
    return matchesSearch && matchesStatus && matchesType
  })

  const selectedBatch = selectedEntry ? batches.find((b) => b.jeNumber === selectedEntry) : null
  const selectedBatchLines = selectedEntry ? journalEntries.filter((e) => e.jeNumber === selectedEntry) : []

  const totalDebits = filteredEntries.reduce((sum, e) => sum + e.debit, 0)
  const totalCredits = filteredEntries.reduce((sum, e) => sum + e.credit, 0)
  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01

  const formatCurrency = (amount: number) => {
    if (amount === 0) return "-"
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(amount)
  }

  const toggleRow = (id: string) => {
    const newSelected = new Set(selectedRows)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedRows(newSelected)
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Adjusting Journal Entries</h1>
          <p className="text-sm text-muted-foreground">Create and manage adjusting journal entries</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Upload className="size-4 mr-2" />
            Import
          </Button>
          <Button variant="outline" size="sm">
            <Download className="size-4 mr-2" />
            Export
          </Button>
          <Button size="sm">
            <Plus className="size-4 mr-2" />
            New Entry
          </Button>
        </div>
      </div>

      {/* Balance Summary */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div>
                <span className="text-xs text-muted-foreground">Total Debits</span>
                <p className="text-lg font-semibold font-mono">{formatCurrency(totalDebits)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Total Credits</span>
                <p className="text-lg font-semibold font-mono">{formatCurrency(totalCredits)}</p>
              </div>
              <Separator orientation="vertical" className="h-8" />
              <div className="flex items-center gap-2">
                {isBalanced ? (
                  <Badge variant="outline" className="text-success border-success/50 bg-success/10">
                    <CheckCircle2 className="size-3 mr-1" />
                    Balanced
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-destructive border-destructive/50 bg-destructive/10">
                    <AlertTriangle className="size-3 mr-1" />
                    Out of Balance: {formatCurrency(Math.abs(totalDebits - totalCredits))}
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{batches.filter((b) => b.status === "Draft").length} Draft</Badge>
              <Badge variant="secondary">{batches.filter((b) => b.status === "Ready for Review").length} Pending Review</Badge>
              <Badge variant="secondary">{batches.filter((b) => b.status === "Posted").length} Posted</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Table */}
      <Card className="flex-1">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Journal Entries</CardTitle>
              <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "lines" | "batches")}>
                <TabsList className="h-8">
                  <TabsTrigger value="batches" className="text-xs px-3">Batches</TabsTrigger>
                  <TabsTrigger value="lines" className="text-xs px-3">Lines</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  placeholder="Search entries..."
                  className="pl-9 h-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px] h-9">
                  <Filter className="size-4 mr-2" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {jeStatuses.map((status) => (
                    <SelectItem key={status} value={status}>{status}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[140px] h-9">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {adjustmentTypes.map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {viewMode === "batches" ? (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[40px]">
                    <Checkbox />
                  </TableHead>
                  <TableHead className="text-xs">JE #</TableHead>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Period</TableHead>
                  <TableHead className="text-xs">Description</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs text-right">Debit</TableHead>
                  <TableHead className="text-xs text-right">Credit</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Prepared By</TableHead>
                  <TableHead className="text-xs">Support</TableHead>
                  <TableHead className="text-xs w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBatches.map((batch) => {
                  const status = statusConfig[batch.status as JournalEntry["status"]]
                  const isDraft = batch.status === "Draft"
                  return (
                    <TableRow
                      key={batch.jeNumber}
                      className={`cursor-pointer ${isDraft ? "bg-muted/30" : ""}`}
                      onClick={() => setSelectedEntry(batch.jeNumber)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedRows.has(batch.jeNumber)}
                          onCheckedChange={() => toggleRow(batch.jeNumber)}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-sm font-medium">
                        {batch.jeNumber}
                        {isDraft && (
                          <Badge variant="outline" className="ml-2 text-[10px]">Draft</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{batch.date}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{batch.period}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{batch.description}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{batch.adjustmentType}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-right font-mono">{formatCurrency(batch.totalDebit)}</TableCell>
                      <TableCell className="text-sm text-right font-mono">{formatCurrency(batch.totalCredit)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${status.color} ${status.bgColor}`}>
                          {batch.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{batch.preparedBy}</TableCell>
                      <TableCell>
                        {batch.hasSupport ? (
                          <Paperclip className="size-4 text-muted-foreground" />
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Copy className="size-4 mr-2" />
                              Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <RotateCcw className="size-4 mr-2" />
                              Reverse
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem>
                              <Send className="size-4 mr-2" />
                              Submit for Review
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs">JE #</TableHead>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Account</TableHead>
                  <TableHead className="text-xs text-right">Debit</TableHead>
                  <TableHead className="text-xs text-right">Credit</TableHead>
                  <TableHead className="text-xs">Description</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEntries.map((entry) => {
                  const status = statusConfig[entry.status]
                  return (
                    <TableRow
                      key={entry.id}
                      className="cursor-pointer"
                      onClick={() => setSelectedEntry(entry.jeNumber)}
                    >
                      <TableCell className="font-mono text-sm">{entry.jeNumber}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{entry.date}</TableCell>
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-muted-foreground">{entry.accountNumber}</span>
                          <span className="truncate max-w-[150px]">{entry.accountName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-right font-mono">{formatCurrency(entry.debit)}</TableCell>
                      <TableCell className="text-sm text-right font-mono">{formatCurrency(entry.credit)}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{entry.description}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{entry.adjustmentType}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${status.color} ${status.bgColor}`}>
                          {entry.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Entry Details Drawer */}
      <Sheet open={!!selectedEntry} onOpenChange={(open) => !open && setSelectedEntry(null)}>
        <SheetContent className="w-[500px] sm:max-w-[500px] overflow-y-auto">
          {selectedBatch && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-2">
                  <SheetTitle className="font-mono">{selectedBatch.jeNumber}</SheetTitle>
                  <Badge variant="outline" className={statusConfig[selectedBatch.status as JournalEntry["status"]].bgColor}>
                    {selectedBatch.status}
                  </Badge>
                </div>
                <SheetDescription>{selectedBatch.description}</SheetDescription>
              </SheetHeader>

              <Tabs defaultValue="details" className="mt-6">
                <TabsList className="w-full">
                  <TabsTrigger value="details" className="flex-1">Details</TabsTrigger>
                  <TabsTrigger value="comments" className="flex-1">
                    Comments
                    {selectedBatch.comments.length > 0 && (
                      <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 text-[10px]">
                        {selectedBatch.comments.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="history" className="flex-1">History</TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="mt-4 space-y-6">
                  {/* Entry Lines */}
                  <div>
                    <Label className="text-xs text-muted-foreground mb-2 block">Journal Entry Lines</Label>
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="text-xs">Account</TableHead>
                            <TableHead className="text-xs text-right">Debit</TableHead>
                            <TableHead className="text-xs text-right">Credit</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedBatchLines.map((line) => (
                            <TableRow key={line.id}>
                              <TableCell className="text-sm">
                                <div>
                                  <span className="font-mono text-muted-foreground">{line.accountNumber}</span>
                                  <span className="ml-2">{line.accountName}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-sm text-right font-mono">{formatCurrency(line.debit)}</TableCell>
                              <TableCell className="text-sm text-right font-mono">{formatCurrency(line.credit)}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-muted/50 font-medium">
                            <TableCell className="text-sm">Total</TableCell>
                            <TableCell className="text-sm text-right font-mono">{formatCurrency(selectedBatch.totalDebit)}</TableCell>
                            <TableCell className="text-sm text-right font-mono">{formatCurrency(selectedBatch.totalCredit)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  {/* Metadata */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">Date</Label>
                      <p className="text-sm font-medium">{selectedBatch.date}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Period</Label>
                      <p className="text-sm font-medium">{selectedBatch.period}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Entity</Label>
                      <p className="text-sm font-medium">{selectedBatch.entity}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Adjustment Type</Label>
                      <Badge variant="outline">{selectedBatch.adjustmentType}</Badge>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Prepared By</Label>
                      <p className="text-sm font-medium">{selectedBatch.preparedBy}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Reviewed By</Label>
                      <p className="text-sm font-medium">{selectedBatch.reviewedBy || "-"}</p>
                    </div>
                  </div>

                  {/* Support */}
                  <div>
                    <Label className="text-xs text-muted-foreground mb-2 block">Supporting Documentation</Label>
                    {selectedBatch.hasSupport ? (
                      <div className="flex items-center gap-2 p-3 border rounded-lg">
                        <FileText className="size-4 text-muted-foreground" />
                        <span className="text-sm">Lease agreement</span>
                        <Button variant="ghost" size="sm" className="ml-auto h-7">
                          View
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center p-6 border border-dashed rounded-lg text-muted-foreground">
                        <Paperclip className="size-4 mr-2" />
                        <span className="text-sm">No attachments</span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-4">
                    {selectedBatch.status === "Draft" && (
                      <Button className="flex-1">
                        <Send className="size-4 mr-2" />
                        Submit for Review
                      </Button>
                    )}
                    {selectedBatch.status === "Ready for Review" && (
                      <Button className="flex-1">
                        <CheckCircle2 className="size-4 mr-2" />
                        Mark as Reviewed
                      </Button>
                    )}
                    {selectedBatch.status === "Reviewed" && (
                      <Button className="flex-1 bg-success hover:bg-success/90">
                        <CheckCircle2 className="size-4 mr-2" />
                        Post Entry
                      </Button>
                    )}
                    <Button variant="outline">Edit</Button>
                  </div>
                </TabsContent>

                <TabsContent value="comments" className="mt-4">
                  <div className="space-y-4">
                    {selectedBatch.comments.length > 0 ? (
                      selectedBatch.comments.map((comment, idx) => (
                        <div key={idx} className="flex gap-3 p-3 bg-muted/50 rounded-lg">
                          <MessageSquare className="size-4 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-sm">{comment}</p>
                            <p className="text-xs text-muted-foreground mt-1">Mike Chen - Dec 30, 2024</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-8">No comments yet</p>
                    )}
                    <div className="pt-4">
                      <Textarea placeholder="Add a comment..." className="resize-none" rows={3} />
                      <Button size="sm" className="mt-2">Add Comment</Button>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="history" className="mt-4">
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <History className="size-4 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">Entry Created</p>
                        <p className="text-xs text-muted-foreground">Sarah Johnson - Dec 28, 2024 at 2:30 PM</p>
                      </div>
                    </div>
                    {selectedBatch.status !== "Draft" && (
                      <div className="flex items-start gap-3">
                        <History className="size-4 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">Submitted for Review</p>
                          <p className="text-xs text-muted-foreground">Sarah Johnson - Dec 29, 2024 at 10:15 AM</p>
                        </div>
                      </div>
                    )}
                    {(selectedBatch.status === "Reviewed" || selectedBatch.status === "Posted") && (
                      <div className="flex items-start gap-3">
                        <History className="size-4 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">Reviewed</p>
                          <p className="text-xs text-muted-foreground">Mike Chen - Dec 30, 2024 at 9:00 AM</p>
                        </div>
                      </div>
                    )}
                    {selectedBatch.status === "Posted" && (
                      <div className="flex items-start gap-3">
                        <History className="size-4 text-success mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-success">Posted</p>
                          <p className="text-xs text-muted-foreground">Mike Chen - Dec 30, 2024 at 3:45 PM</p>
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
