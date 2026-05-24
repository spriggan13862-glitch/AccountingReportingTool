"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Bell, HelpCircle } from "lucide-react"
import { clients, periods, entities } from "@/lib/mock-data"

interface TopBarProps {
  selectedClient: string
  onClientChange: (client: string) => void
  selectedPeriod: string
  onPeriodChange: (period: string) => void
  selectedEntity: string
  onEntityChange: (entity: string) => void
}

export function TopBar({
  selectedClient,
  onClientChange,
  selectedPeriod,
  onPeriodChange,
  selectedEntity,
  onEntityChange,
}: TopBarProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4">
      <div className="flex items-center gap-4">
        {/* Client Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Client</span>
          <Select value={selectedClient} onValueChange={onClientChange}>
            <SelectTrigger className="w-[180px] h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Period Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Period</span>
          <Select value={selectedPeriod} onValueChange={onPeriodChange}>
            <SelectTrigger className="w-[150px] h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {periods.map((period) => (
                <SelectItem key={period.id} value={period.id}>
                  {period.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Entity Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Entity</span>
          <Select value={selectedEntity} onValueChange={onEntityChange}>
            <SelectTrigger className="w-[160px] h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {entities.map((entity) => (
                <SelectItem key={entity.id} value={entity.id}>
                  {entity.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Status Indicator */}
        <Badge variant="outline" className="bg-warning/10 text-warning-foreground border-warning/30 text-xs">
          3 Draft Entries
        </Badge>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <HelpCircle className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 relative">
          <Bell className="size-4" />
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground">
            2
          </span>
        </Button>
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-primary text-primary-foreground text-xs">SJ</AvatarFallback>
        </Avatar>
      </div>
    </header>
  )
}
