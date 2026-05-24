"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import {
  Upload,
  FileSpreadsheet,
  FileText,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Clock,
  Search,
  MoreHorizontal,
  Eye,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { importHistory, validationIssues, type ImportFile } from "@/lib/mock-data"

const fileTypeIcons: Record<string, React.ReactNode> = {
  "Trial Balance": <FileSpreadsheet className="size-4 text-chart-1" />,
  "General Ledger": <FileText className="size-4 text-chart-2" />,
  "Chart of Accounts": <FileSpreadsheet className="size-4 text-chart-3" />,
}

const statusConfig: Record<ImportFile["status"], { icon: React.ReactNode; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  "Processing": { icon: <Clock className="size-3" />, variant: "secondary" },
  "Validated": { icon: <CheckCircle2 className="size-3" />, variant: "outline" },
  "Has Issues": { icon: <AlertTriangle className="size-3" />, variant: "destructive" },
  "Imported": { icon: <CheckCircle2 className="size-3" />, variant: "default" },
}

export function ImportCenter() {
  const [searchQuery, setSearchQuery] = useState("")

  const filteredImports = importHistory.filter(
    (file) =>
      file.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      file.type.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Import Center</h1>
          <p className="text-sm text-muted-foreground">Upload and manage your financial data imports</p>
        </div>
        <Button>
          <Upload className="size-4 mr-2" />
          New Import
        </Button>
      </div>

      {/* Upload Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-dashed hover:border-primary/50 hover:bg-accent/50 transition-colors cursor-pointer">
          <CardContent className="flex flex-col items-center justify-center p-6 text-center">
            <div className="mb-3 rounded-lg bg-chart-1/10 p-3">
              <FileSpreadsheet className="size-6 text-chart-1" />
            </div>
            <CardTitle className="text-sm font-medium">Trial Balance</CardTitle>
            <CardDescription className="text-xs mt-1">
              CSV, XLSX
            </CardDescription>
            <div className="flex gap-1 mt-2">
              <Badge variant="outline" className="text-[10px]">CSV</Badge>
              <Badge variant="outline" className="text-[10px]">XLSX</Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="border-dashed hover:border-primary/50 hover:bg-accent/50 transition-colors cursor-pointer">
          <CardContent className="flex flex-col items-center justify-center p-6 text-center">
            <div className="mb-3 rounded-lg bg-chart-2/10 p-3">
              <FileText className="size-6 text-chart-2" />
            </div>
            <CardTitle className="text-sm font-medium">General Ledger</CardTitle>
            <CardDescription className="text-xs mt-1">
              CSV, XLSX
            </CardDescription>
            <div className="flex gap-1 mt-2">
              <Badge variant="outline" className="text-[10px]">CSV</Badge>
              <Badge variant="outline" className="text-[10px]">XLSX</Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="border-dashed hover:border-primary/50 hover:bg-accent/50 transition-colors cursor-pointer">
          <CardContent className="flex flex-col items-center justify-center p-6 text-center">
            <div className="mb-3 rounded-lg bg-chart-3/10 p-3">
              <FileSpreadsheet className="size-6 text-chart-3" />
            </div>
            <CardTitle className="text-sm font-medium">Chart of Accounts</CardTitle>
            <CardDescription className="text-xs mt-1">
              QuickBooks, CSV, XLSX
            </CardDescription>
            <div className="flex gap-1 mt-2">
              <Badge variant="outline" className="text-[10px]">QB</Badge>
              <Badge variant="outline" className="text-[10px]">CSV</Badge>
              <Badge variant="outline" className="text-[10px]">XLSX</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Import History Table */}
        <div className="col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Import History</CardTitle>
                <div className="relative w-64">
                  <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                  <Input
                    placeholder="Search imports..."
                    className="pl-9 h-9"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs">File Name</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs">Period</TableHead>
                    <TableHead className="text-xs">Uploaded By</TableHead>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Issues</TableHead>
                    <TableHead className="text-xs w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredImports.map((file) => {
                    const status = statusConfig[file.status]
                    return (
                      <TableRow key={file.id}>
                        <TableCell className="font-medium text-sm">
                          <div className="flex items-center gap-2">
                            {fileTypeIcons[file.type]}
                            <span className="truncate max-w-[180px]">{file.fileName}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{file.type}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{file.period}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{file.uploadedBy}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{file.dateUploaded}</TableCell>
                        <TableCell>
                          <Badge variant={status.variant} className="text-xs gap-1">
                            {status.icon}
                            {file.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {file.validationIssues > 0 ? (
                            <span className="text-sm font-medium text-destructive">{file.validationIssues}</span>
                          ) : (
                            <span className="text-sm text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>
                                <Eye className="size-4 mr-2" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem>Re-validate</DropdownMenuItem>
                              <DropdownMenuItem>Download</DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Validation Summary Panel */}
        <div className="col-span-1">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Validation Summary</CardTitle>
              <CardDescription className="text-xs">Issues found in recent imports</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {validationIssues.map((issue) => (
                <div
                  key={issue.id}
                  className={`flex items-start gap-3 rounded-lg p-3 ${
                    issue.type === "error" ? "bg-destructive/10" : "bg-warning/10"
                  }`}
                >
                  {issue.type === "error" ? (
                    <AlertCircle className="size-4 text-destructive mt-0.5 shrink-0" />
                  ) : (
                    <AlertTriangle className="size-4 text-warning mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium ${issue.type === "error" ? "text-destructive" : "text-warning-foreground"}`}>
                        {issue.category}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {issue.affectedItems} {issue.affectedItems === 1 ? "item" : "items"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{issue.message}</p>
                  </div>
                </div>
              ))}
              <Button className="w-full mt-4" variant="outline" size="sm">
                <Eye className="size-4 mr-2" />
                Review Import
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
