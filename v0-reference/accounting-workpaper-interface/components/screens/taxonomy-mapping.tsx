"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Search,
  ChevronRight,
  ChevronDown,
  Check,
  X,
  RefreshCw,
  Flag,
  Zap,
  Settings,
  ArrowRight,
} from "lucide-react"
import { chartOfAccounts, taxonomyCategories } from "@/lib/mock-data"

type MappingSuggestion = {
  accountId: string
  suggestedCategory: string
  confidence: "high" | "medium" | "low"
}

// Mock mapping suggestions
const mappingSuggestions: MappingSuggestion[] = [
  { accountId: "32", suggestedCategory: "Other Operating Expenses", confidence: "medium" },
  { accountId: "33", suggestedCategory: "Other Operating Expenses", confidence: "low" },
  { accountId: "34", suggestedCategory: "Revenue", confidence: "low" },
  { accountId: "35", suggestedCategory: "Accounts Receivable", confidence: "high" },
]

const confidenceColors = {
  high: "bg-success/10 text-success border-success/30",
  medium: "bg-warning/10 text-warning-foreground border-warning/30",
  low: "bg-muted text-muted-foreground border-muted-foreground/30",
}

export function TaxonomyMapping() {
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(["cash", "ar", "revenue", "cogs"]))
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set())

  const unmappedAccounts = chartOfAccounts.filter((a) => !a.taxonomyCategory && a.active)
  const mappedCount = chartOfAccounts.filter((a) => a.taxonomyCategory && a.active).length
  const totalActive = chartOfAccounts.filter((a) => a.active).length
  const mappingProgress = Math.round((mappedCount / totalActive) * 100)

  const filteredAccounts = chartOfAccounts.filter(
    (account) =>
      account.active &&
      (account.accountNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        account.accountName.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  const toggleCategory = (id: string) => {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedCategories(newExpanded)
  }

  const toggleAccount = (id: string) => {
    const newSelected = new Set(selectedAccounts)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedAccounts(newSelected)
  }

  const getSuggestion = (accountId: string) => {
    return mappingSuggestions.find((s) => s.accountId === accountId)
  }

  const getAccountsByTaxonomy = (taxonomyName: string) => {
    return chartOfAccounts.filter((a) => a.taxonomyCategory === taxonomyName && a.active)
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Taxonomy Mapping</h1>
          <p className="text-sm text-muted-foreground">Map client accounts to standardized taxonomy categories</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Settings className="size-4 mr-2" />
            Mapping Rules
          </Button>
          <Button variant="outline" size="sm">
            <Zap className="size-4 mr-2" />
            Auto-Map
          </Button>
        </div>
      </div>

      {/* Progress Card */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium">Mapping Progress</span>
              <Badge variant="outline" className={unmappedAccounts.length > 0 ? "text-warning border-warning/50 bg-warning/10" : "text-success border-success/50 bg-success/10"}>
                {unmappedAccounts.length} Unmapped
              </Badge>
            </div>
            <span className="text-sm font-medium">{mappingProgress}%</span>
          </div>
          <Progress value={mappingProgress} className="h-2" />
          <p className="text-xs text-muted-foreground mt-2">
            {mappedCount} of {totalActive} active accounts mapped
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-6 flex-1">
        {/* Client Accounts */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Client Accounts</CardTitle>
                <CardDescription className="text-xs">
                  {selectedAccounts.size > 0 ? `${selectedAccounts.size} selected` : "Select accounts to map"}
                </CardDescription>
              </div>
              <div className="relative w-48">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  className="pl-9 h-8 text-sm"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            <ScrollArea className="h-[500px]">
              <div className="divide-y">
                {filteredAccounts.map((account) => {
                  const suggestion = getSuggestion(account.id)
                  return (
                    <div
                      key={account.id}
                      className={`flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 cursor-pointer transition-colors ${
                        selectedAccounts.has(account.id) ? "bg-primary/5" : ""
                      }`}
                      onClick={() => toggleAccount(account.id)}
                    >
                      <Checkbox
                        checked={selectedAccounts.has(account.id)}
                        onCheckedChange={() => toggleAccount(account.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">
                            {account.accountNumber || "—"}
                          </span>
                          <span className="text-sm font-medium truncate">{account.accountName}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {account.taxonomyCategory ? (
                            <Badge variant="outline" className="text-[10px] h-5">
                              {account.taxonomyCategory}
                            </Badge>
                          ) : suggestion ? (
                            <div className="flex items-center gap-1">
                              <Badge variant="outline" className={`text-[10px] h-5 ${confidenceColors[suggestion.confidence]}`}>
                                Suggested: {suggestion.suggestedCategory}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">
                                ({suggestion.confidence} confidence)
                              </span>
                            </div>
                          ) : (
                            <Badge variant="outline" className="text-[10px] h-5 text-warning border-warning/50 bg-warning/10">
                              Unmapped
                            </Badge>
                          )}
                        </div>
                      </div>
                      {suggestion && !account.taxonomyCategory && (
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-success hover:text-success hover:bg-success/10">
                            <Check className="size-3" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10">
                            <X className="size-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Taxonomy Tree */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Standard Taxonomy</CardTitle>
                <CardDescription className="text-xs">
                  {selectedAccounts.size > 0 
                    ? "Click a category to map selected accounts"
                    : "Financial statement taxonomy categories"
                  }
                </CardDescription>
              </div>
              {selectedAccounts.size > 0 && (
                <Button size="sm" variant="outline">
                  <Flag className="size-4 mr-2" />
                  Flag for Review
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            <ScrollArea className="h-[500px]">
              <div className="p-2">
                {taxonomyCategories.map((category) => {
                  const isExpanded = expandedCategories.has(category.id)
                  const accountsInCategory = getAccountsByTaxonomy(category.name)
                  return (
                    <Collapsible
                      key={category.id}
                      open={isExpanded}
                      onOpenChange={() => toggleCategory(category.id)}
                    >
                      <CollapsibleTrigger asChild>
                        <div
                          className={`flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors ${
                            selectedAccounts.size > 0 ? "hover:bg-primary/10" : ""
                          }`}
                        >
                          {category.children.length > 0 ? (
                            isExpanded ? (
                              <ChevronDown className="size-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="size-4 text-muted-foreground" />
                            )
                          ) : (
                            <div className="w-4" />
                          )}
                          <span className="text-sm font-medium flex-1">{category.name}</span>
                          <Badge variant="outline" className="text-[10px]">{category.type}</Badge>
                          {accountsInCategory.length > 0 && (
                            <Badge variant="secondary" className="text-[10px]">
                              {accountsInCategory.length}
                            </Badge>
                          )}
                          {selectedAccounts.size > 0 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs"
                              onClick={(e) => {
                                e.stopPropagation()
                                // Handle mapping here
                              }}
                            >
                              <ArrowRight className="size-3 mr-1" />
                              Map
                            </Button>
                          )}
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="ml-6 space-y-0.5 mt-1">
                          {category.children.length > 0 ? (
                            category.children.map((child, idx) => (
                              <div
                                key={idx}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer text-sm text-muted-foreground"
                              >
                                <span>{child}</span>
                              </div>
                            ))
                          ) : accountsInCategory.length > 0 ? (
                            accountsInCategory.map((account) => (
                              <div
                                key={account.id}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/30 text-xs"
                              >
                                <span className="font-mono text-muted-foreground">{account.accountNumber}</span>
                                <span className="truncate">{account.accountName}</span>
                              </div>
                            ))
                          ) : (
                            <div className="px-3 py-1.5 text-xs text-muted-foreground italic">
                              No accounts mapped
                            </div>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Actions Footer */}
      {selectedAccounts.size > 0 && (
        <Card className="fixed bottom-6 left-1/2 -translate-x-1/2 shadow-lg border-primary/20">
          <CardContent className="py-3 px-4 flex items-center gap-4">
            <span className="text-sm font-medium">{selectedAccounts.size} accounts selected</span>
            <Button size="sm">
              <RefreshCw className="size-4 mr-2" />
              Bulk Map Selected
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSelectedAccounts(new Set())}>
              Clear Selection
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
