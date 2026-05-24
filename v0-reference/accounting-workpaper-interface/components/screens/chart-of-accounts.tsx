"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
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
import { Label } from "@/components/ui/label"
import {
  Search,
  Filter,
  Download,
  Plus,
  MoreHorizontal,
  AlertTriangle,
  Edit2,
  Copy,
  Trash2,
  ChevronDown,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { chartOfAccounts, type Account } from "@/lib/mock-data"

const accountTypeColors: Record<Account["accountType"], string> = {
  Asset: "bg-chart-1/10 text-chart-1",
  Liability: "bg-chart-2/10 text-chart-2",
  Equity: "bg-chart-3/10 text-chart-3",
  Revenue: "bg-success/10 text-success",
  Expense: "bg-chart-5/10 text-chart-5",
}

export function ChartOfAccountsManager() {
  const [searchQuery, setSearchQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null)
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())

  const filteredAccounts = chartOfAccounts.filter((account) => {
    const matchesSearch =
      account.accountNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      account.accountName.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesType = typeFilter === "all" || account.accountType === typeFilter
    return matchesSearch && matchesType
  })

  const toggleRow = (id: string) => {
    const newSelected = new Set(selectedRows)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedRows(newSelected)
  }

  const toggleAllRows = () => {
    if (selectedRows.size === filteredAccounts.length) {
      setSelectedRows(new Set())
    } else {
      setSelectedRows(new Set(filteredAccounts.map((a) => a.id)))
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(amount)
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Chart of Accounts</h1>
          <p className="text-sm text-muted-foreground">
            Manage your client&apos;s chart of accounts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Download className="size-4 mr-2" />
            Export
          </Button>
          <Button size="sm">
            <Plus className="size-4 mr-2" />
            Add Account
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              {filteredAccounts.length} Accounts
              {selectedRows.size > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {selectedRows.size} selected
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-3">
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  placeholder="Search accounts..."
                  className="pl-9 h-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[140px] h-9">
                  <Filter className="size-4 mr-2" />
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="Asset">Asset</SelectItem>
                  <SelectItem value="Liability">Liability</SelectItem>
                  <SelectItem value="Equity">Equity</SelectItem>
                  <SelectItem value="Revenue">Revenue</SelectItem>
                  <SelectItem value="Expense">Expense</SelectItem>
                </SelectContent>
              </Select>
              {selectedRows.size > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      Bulk Actions
                      <ChevronDown className="size-4 ml-2" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem>Set Taxonomy</DropdownMenuItem>
                    <DropdownMenuItem>Mark Inactive</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive">Delete Selected</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={selectedRows.size === filteredAccounts.length && filteredAccounts.length > 0}
                    onCheckedChange={toggleAllRows}
                  />
                </TableHead>
                <TableHead className="text-xs">Account #</TableHead>
                <TableHead className="text-xs">Account Name</TableHead>
                <TableHead className="text-xs">Type</TableHead>
                <TableHead className="text-xs">Normal Balance</TableHead>
                <TableHead className="text-xs">FS Line</TableHead>
                <TableHead className="text-xs">Taxonomy</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Source</TableHead>
                <TableHead className="text-xs text-right">Balance</TableHead>
                <TableHead className="text-xs w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAccounts.map((account) => {
                const hasIssue = !account.taxonomyCategory || !account.accountNumber || !account.active
                return (
                  <TableRow
                    key={account.id}
                    className={`cursor-pointer ${!account.active ? "opacity-50" : ""}`}
                    onClick={() => setSelectedAccount(account)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedRows.has(account.id)}
                        onCheckedChange={() => toggleRow(account.id)}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      <div className="flex items-center gap-1.5">
                        {!account.accountNumber && (
                          <AlertTriangle className="size-3 text-warning" />
                        )}
                        {account.accountNumber || "-"}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium text-sm">
                      <div className="flex items-center gap-1.5">
                        {account.source === "Manual" && (
                          <Edit2 className="size-3 text-muted-foreground" />
                        )}
                        {account.accountName}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${accountTypeColors[account.accountType]}`}>
                        {account.accountType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {account.normalBalance}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">
                      {account.fsLine || "-"}
                    </TableCell>
                    <TableCell>
                      {account.taxonomyCategory ? (
                        <Badge variant="outline" className="text-xs">
                          {account.taxonomyCategory}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-warning border-warning/50 bg-warning/10">
                          Unmapped
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {account.active ? (
                        <Badge variant="outline" className="text-xs text-success border-success/50 bg-success/10">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          Inactive
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {account.source}
                    </TableCell>
                    <TableCell className="text-sm text-right font-mono">
                      {formatCurrency(account.balance)}
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
                            <Edit2 className="size-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Copy className="size-4 mr-2" />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive">
                            <Trash2 className="size-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
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

      {/* Account Details Drawer */}
      <Sheet open={!!selectedAccount} onOpenChange={(open) => !open && setSelectedAccount(null)}>
        <SheetContent className="w-[400px] sm:max-w-[400px]">
          {selectedAccount && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <span className="font-mono">{selectedAccount.accountNumber}</span>
                  <Badge variant="outline" className={accountTypeColors[selectedAccount.accountType]}>
                    {selectedAccount.accountType}
                  </Badge>
                </SheetTitle>
                <SheetDescription>{selectedAccount.accountName}</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Normal Balance</Label>
                    <p className="text-sm font-medium">{selectedAccount.normalBalance}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Status</Label>
                    <p className="text-sm font-medium">{selectedAccount.active ? "Active" : "Inactive"}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Source</Label>
                    <p className="text-sm font-medium">{selectedAccount.source}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Last Modified</Label>
                    <p className="text-sm font-medium">{selectedAccount.lastModified}</p>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Financial Statement Line</Label>
                  <p className="text-sm font-medium">{selectedAccount.fsLine || "-"}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Taxonomy Category</Label>
                  {selectedAccount.taxonomyCategory ? (
                    <Badge variant="outline" className="mt-1">{selectedAccount.taxonomyCategory}</Badge>
                  ) : (
                    <Badge variant="outline" className="mt-1 text-warning border-warning/50 bg-warning/10">
                      Unmapped
                    </Badge>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Current Balance</Label>
                  <p className="text-2xl font-semibold font-mono">
                    {formatCurrency(selectedAccount.balance)}
                  </p>
                </div>
                <div className="flex gap-2 pt-4">
                  <Button className="flex-1">
                    <Edit2 className="size-4 mr-2" />
                    Edit Account
                  </Button>
                  <Button variant="outline">
                    View Transactions
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
