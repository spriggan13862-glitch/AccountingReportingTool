"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import {
  Building2,
  Users,
  Calendar,
  Bell,
  Lock,
  Database,
  FileText,
  HelpCircle,
} from "lucide-react"

export function Settings() {
  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your workspace preferences</p>
      </div>

      {/* Client Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="size-5 text-muted-foreground" />
            <CardTitle className="text-base">Client Settings</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Configure settings for Sunrise Coffee Co.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm">Client Name</Label>
              <Input defaultValue="Sunrise Coffee Co." className="mt-1.5" />
            </div>
            <div>
              <Label className="text-sm">Industry</Label>
              <Select defaultValue="fb">
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fb">Food & Beverage</SelectItem>
                  <SelectItem value="tech">Technology</SelectItem>
                  <SelectItem value="retail">Retail</SelectItem>
                  <SelectItem value="services">Professional Services</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Fiscal Year End</Label>
              <Select defaultValue="dec">
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dec">December 31</SelectItem>
                  <SelectItem value="mar">March 31</SelectItem>
                  <SelectItem value="jun">June 30</SelectItem>
                  <SelectItem value="sep">September 30</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Accounting Basis</Label>
              <Select defaultValue="accrual">
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="accrual">Accrual</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Period Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calendar className="size-5 text-muted-foreground" />
            <CardTitle className="text-base">Period Settings</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Manage open and closed periods
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">December 2024</p>
              <p className="text-xs text-muted-foreground">Current working period</p>
            </div>
            <Badge variant="outline" className="bg-success/10 text-success">Open</Badge>
          </div>
          <Separator />
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">November 2024</p>
              <p className="text-xs text-muted-foreground">Closed on Dec 15, 2024</p>
            </div>
            <Badge variant="secondary">Closed</Badge>
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">October 2024</p>
              <p className="text-xs text-muted-foreground">Closed on Nov 10, 2024</p>
            </div>
            <Badge variant="secondary">Closed</Badge>
          </div>
          <Button variant="outline" size="sm">Manage Periods</Button>
        </CardContent>
      </Card>

      {/* Team & Permissions */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="size-5 text-muted-foreground" />
            <CardTitle className="text-base">Team & Permissions</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Manage team access and roles
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-primary h-8 w-8 flex items-center justify-center text-primary-foreground text-xs font-medium">
                SJ
              </div>
              <div>
                <p className="text-sm font-medium">Sarah Johnson</p>
                <p className="text-xs text-muted-foreground">sarah@ledgeradvisory.com</p>
              </div>
            </div>
            <Badge>Admin</Badge>
          </div>
          <Separator />
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-chart-2 h-8 w-8 flex items-center justify-center text-white text-xs font-medium">
                MC
              </div>
              <div>
                <p className="text-sm font-medium">Mike Chen</p>
                <p className="text-xs text-muted-foreground">mike@ledgeradvisory.com</p>
              </div>
            </div>
            <Badge variant="outline">Reviewer</Badge>
          </div>
          <Button variant="outline" size="sm">Invite Team Member</Button>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="size-5 text-muted-foreground" />
            <CardTitle className="text-base">Notifications</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Configure notification preferences
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Email notifications</p>
              <p className="text-xs text-muted-foreground">Receive email when entries need review</p>
            </div>
            <Switch defaultChecked />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Import alerts</p>
              <p className="text-xs text-muted-foreground">Notify on validation issues</p>
            </div>
            <Switch defaultChecked />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Weekly digest</p>
              <p className="text-xs text-muted-foreground">Summary of activity</p>
            </div>
            <Switch />
          </div>
        </CardContent>
      </Card>

      {/* Data & Export */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="size-5 text-muted-foreground" />
            <CardTitle className="text-base">Data & Export</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Export and backup options
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Export All Data</p>
              <p className="text-xs text-muted-foreground">Download complete workpaper package</p>
            </div>
            <Button variant="outline" size="sm">
              <FileText className="size-4 mr-2" />
              Export
            </Button>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Auto-backup</p>
              <p className="text-xs text-muted-foreground">Daily automatic backups</p>
            </div>
            <Switch defaultChecked />
          </div>
        </CardContent>
      </Card>

      {/* Support */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <HelpCircle className="size-5 text-muted-foreground" />
            <CardTitle className="text-base">Support</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button variant="outline" className="w-full justify-start">
            <FileText className="size-4 mr-2" />
            Documentation
          </Button>
          <Button variant="outline" className="w-full justify-start">
            <HelpCircle className="size-4 mr-2" />
            Contact Support
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
