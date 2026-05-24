"use client"

import { useState } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { TopBar } from "@/components/top-bar"
import { Dashboard } from "@/components/screens/dashboard"
import { ImportCenter } from "@/components/screens/import-center"
import { ChartOfAccountsManager } from "@/components/screens/chart-of-accounts"
import { TaxonomyMapping } from "@/components/screens/taxonomy-mapping"
import { JournalEntriesWorkspace } from "@/components/screens/journal-entries"
import { DraftReviewQueue } from "@/components/screens/draft-review"
import { BridgePreview } from "@/components/screens/bridge-preview"
import { ReportsPreview } from "@/components/screens/reports-preview"
import { Settings } from "@/components/screens/settings"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function AccountingWorkpaper() {
  const [activeScreen, setActiveScreen] = useState("dashboard")
  const [selectedClient, setSelectedClient] = useState("1")
  const [selectedPeriod, setSelectedPeriod] = useState("2024-12")
  const [selectedEntity, setSelectedEntity] = useState("1")
  const [jeSubTab, setJeSubTab] = useState("workspace")

  const renderScreen = () => {
    switch (activeScreen) {
      case "dashboard":
        return <Dashboard onNavigate={setActiveScreen} />
      case "imports":
        return <ImportCenter />
      case "coa":
        return <ChartOfAccountsManager />
      case "taxonomy":
        return <TaxonomyMapping />
      case "journal-entries":
        return (
          <div className="flex flex-col h-full">
            <div className="px-6 pt-6 pb-0">
              <Tabs value={jeSubTab} onValueChange={setJeSubTab}>
                <TabsList>
                  <TabsTrigger value="workspace">Workspace</TabsTrigger>
                  <TabsTrigger value="review-queue">Review Queue</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            {jeSubTab === "workspace" ? (
              <JournalEntriesWorkspace />
            ) : (
              <DraftReviewQueue />
            )}
          </div>
        )
      case "draft-review":
        return <DraftReviewQueue />
      case "bridge":
        return <BridgePreview />
      case "reports":
        return <ReportsPreview />
      case "settings":
        return <Settings />
      default:
        return <Dashboard onNavigate={setActiveScreen} />
    }
  }

  return (
    <div className="flex h-screen bg-background">
      <AppSidebar activeScreen={activeScreen} onScreenChange={setActiveScreen} />
      <div className="flex flex-1 flex-col min-w-0">
        <TopBar
          selectedClient={selectedClient}
          onClientChange={setSelectedClient}
          selectedPeriod={selectedPeriod}
          onPeriodChange={setSelectedPeriod}
          selectedEntity={selectedEntity}
          onEntityChange={setSelectedEntity}
        />
        <ScrollArea className="flex-1">
          <main className="min-h-full">
            {renderScreen()}
          </main>
        </ScrollArea>
      </div>
    </div>
  )
}
