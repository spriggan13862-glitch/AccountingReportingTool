"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Upload,
  List,
  GitBranch,
  FileSpreadsheet,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  FileCheck,
  GitCompare,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

type NavItem = {
  id: string
  label: string
  icon: React.ReactNode
}

const navItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard className="size-5" /> },
  { id: "imports", label: "Imports", icon: <Upload className="size-5" /> },
  { id: "coa", label: "Chart of Accounts", icon: <List className="size-5" /> },
  { id: "taxonomy", label: "Taxonomy Mapping", icon: <GitBranch className="size-5" /> },
  { id: "journal-entries", label: "Journal Entries", icon: <FileSpreadsheet className="size-5" /> },
  { id: "draft-review", label: "Draft Review", icon: <FileCheck className="size-5" /> },
  { id: "bridge", label: "Bridge Preview", icon: <GitCompare className="size-5" /> },
  { id: "reports", label: "Reports", icon: <BarChart3 className="size-5" /> },
  { id: "settings", label: "Settings", icon: <Settings className="size-5" /> },
]

interface AppSidebarProps {
  activeScreen: string
  onScreenChange: (screen: string) => void
}

export function AppSidebar({ activeScreen, onScreenChange }: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "flex h-full flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-300",
          collapsed ? "w-16" : "w-56"
        )}
      >
        {/* Logo */}
        <div className="flex h-14 items-center border-b border-sidebar-border px-4">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground font-bold text-sm">
                LA
              </div>
              <span className="font-semibold text-sm">Ledger Advisory</span>
            </div>
          )}
          {collapsed && (
            <div className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground font-bold text-sm mx-auto">
              LA
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-2">
          {navItems.map((item) => {
            const isActive = activeScreen === item.id
            const button = (
              <button
                key={item.id}
                onClick={() => onScreenChange(item.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                <span className={cn(isActive && "text-sidebar-primary")}>{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}
              </button>
            )

            if (collapsed) {
              return (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>{button}</TooltipTrigger>
                  <TooltipContent side="right" className="bg-popover text-popover-foreground">
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              )
            }

            return button
          })}
        </nav>

        {/* Collapse toggle */}
        <div className="border-t border-sidebar-border p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed(!collapsed)}
            className="w-full justify-center text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
          >
            {collapsed ? (
              <ChevronRight className="size-4" />
            ) : (
              <>
                <ChevronLeft className="size-4 mr-2" />
                <span>Collapse</span>
              </>
            )}
          </Button>
        </div>
      </aside>
    </TooltipProvider>
  )
}
