import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as Dialog from '@radix-ui/react-dialog'
import {
  BookOpen, Plus, Search, Filter, Download, Upload, Copy, RotateCcw,
  Send, CheckCircle2, MessageSquare, History, AlertTriangle, Paperclip,
  Trash2, X, Check, ArrowRight, Info, ShieldAlert, Sparkles, ChevronRight,
  Lock, Eye, EyeOff, SlidersHorizontal
} from 'lucide-react'

import { journalEntriesApi } from '@/api/journalEntries'
import { workflowApi } from '@/api/workflow'
import { entitiesApi } from '@/api/entities'
import { periodsApi } from '@/api/periods'
import { usersApi } from '@/api/users'

import { PageLayout } from '@/components/ui/PageLayout'
import { AccountingDataGrid } from '@/components/data-grid'
import type { GridColumn, RowAction, BatchAction } from '@/components/data-grid/types'
import { StatusBadge, SeverityBadge } from '@/components/ui/Badge'
import { LoadingState } from '@/components/ui/LoadingState'
import { ErrorState } from '@/components/ui/ErrorState'
import { ErrorBanner } from '@/components/ui/ValidationAlert'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { AccountSearch } from '@/components/ui/AccountSearch'
import { useOrg } from '@/providers/OrgProvider'
import { cn } from '@/utils/cn'
import { EntitySelect } from '@/components/ui/EntitySelect'
import type { JournalEntry, JELine, JECreate, JELineCreate, Account, User, Signoff } from '@/types'

// ---------------------------------------------------------------------------
// LocalStorage Persistence Helpers
// ---------------------------------------------------------------------------

const getExcludedMap = (): Record<number, boolean> => {
  try {
    return JSON.parse(localStorage.getItem('je_excluded_map') || '{}')
  } catch {
    return {}
  }
}
const setExcludedMap = (map: Record<number, boolean>) => {
  localStorage.setItem('je_excluded_map', JSON.stringify(map))
}

const getSubstatusMap = (): Record<number, string> => {
  try {
    return JSON.parse(localStorage.getItem('je_substatus_map') || '{}')
  } catch {
    return {}
  }
}
const setSubstatusMap = (map: Record<number, string>) => {
  localStorage.setItem('je_substatus_map', JSON.stringify(map))
}

const getCommentsMap = (): Record<number, any[]> => {
  try {
    return JSON.parse(localStorage.getItem('je_comments_map') || '{}')
  } catch {
    return {}
  }
}
const setCommentsMap = (map: Record<number, any[]>) => {
  localStorage.setItem('je_comments_map', JSON.stringify(map))
}

const getAttachmentsMap = (): Record<number, string[]> => {
  try {
    return JSON.parse(localStorage.getItem('je_attachments_map') || '{}')
  } catch {
    return {}
  }
}
const setAttachmentsMap = (map: Record<number, string[]>) => {
  localStorage.setItem('je_attachments_map', JSON.stringify(map))
}

// ---------------------------------------------------------------------------
// Constants & Styling Configs
// ---------------------------------------------------------------------------

const ENTRY_TYPES = [
  { value: 'accrual', label: 'Accrual' },
  { value: 'reclass', label: 'Reclass' },
  { value: 'correction', label: 'Correction' },
  { value: 'depreciation', label: 'Depreciation' },
  { value: 'amortization', label: 'Amortization' },
  { value: 'elimination', label: 'Elimination' },
  { value: 'tax_adjustment', label: 'Tax Adjustment' },
  { value: 'opening_balance', label: 'Opening Balance' },
  { value: 'consolidation', label: 'Consolidation' },
  { value: 'other', label: 'Other' },
]

const STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'ready_for_review', label: 'Ready for Review' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'posted', label: 'Posted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'excluded', label: 'Excluded' },
]

const STATUS_COLOR_CLASSES: Record<string, { badge: string; text: string; bg: string; dot: string }> = {
  posted: {
    badge: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
    text: 'text-emerald-800 font-bold',
    bg: 'bg-emerald-50/20 border-emerald-100',
    dot: 'bg-emerald-500'
  },
  reversed: {
    badge: 'bg-slate-100 text-slate-600 border-slate-200',
    text: 'text-slate-600 font-medium',
    bg: 'bg-slate-50 border-slate-150',
    dot: 'bg-slate-400'
  },
  excluded: {
    badge: 'bg-slate-50 text-slate-400 border-slate-200 line-through decoration-slate-300',
    text: 'text-slate-400 font-medium',
    bg: 'bg-slate-50/10 border-slate-100 opacity-60',
    dot: 'bg-slate-300'
  },
  draft: {
    badge: 'bg-indigo-50 text-indigo-700 border-indigo-200/60',
    text: 'text-indigo-700 font-semibold',
    bg: 'bg-indigo-50/10 border-indigo-100',
    dot: 'bg-indigo-500'
  },
  ready_for_review: {
    badge: 'bg-amber-50 text-amber-700 border-amber-250',
    text: 'text-amber-700 font-semibold',
    bg: 'bg-amber-50/35 border-amber-150',
    dot: 'bg-amber-500'
  },
  reviewed: {
    badge: 'bg-teal-50 text-teal-700 border-teal-200',
    text: 'text-teal-700 font-semibold',
    bg: 'bg-teal-50/20 border-teal-150',
    dot: 'bg-teal-500'
  },
  rejected: {
    badge: 'bg-rose-50 text-rose-700 border-rose-250',
    text: 'text-rose-700 font-semibold',
    bg: 'bg-rose-50/20 border-rose-150',
    dot: 'bg-rose-500'
  },
}

function parseDecimal(val: string): number {
  const n = parseFloat(val)
  return isNaN(n) ? 0 : n
}

// Helper to assign temporary unique keys to JELines
let keySeed = 0
function generateLineKey() {
  return `line-key-${++keySeed}`
}

interface EditLineState {
  key: string
  id?: number
  account_id: number
  entity_id: number
  debit: string
  credit: string
  description: string
  _selectedAccount: Account | null
}

export function JournalEntriesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { org } = useOrg()
  const orgId = org?.id ?? 0

  // URL State integration (if drawer needs to open directly from a URL parameter)
  const { id: urlJeId } = useParams<{ id: string }>()

  // Local metadata states
  const [excludedMap, setExcludedMapState] = useState<Record<number, boolean>>(() => getExcludedMap())
  const [substatusMap, setSubstatusMapState] = useState<Record<number, string>>(() => getSubstatusMap())
  const [commentsMap, setCommentsMapState] = useState<Record<number, any[]>>(() => getCommentsMap())
  const [attachmentsMap, setAttachmentsMapState] = useState<Record<number, string[]>>(() => getAttachmentsMap())

  // Grid/Filters State
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [entityFilter, setEntityFilter] = useState<number | ''>('')
  const [periodFilter, setPeriodFilter] = useState<number | ''>('')
  const [preparerFilter, setPreparerFilter] = useState<string>('')
  const [reviewerFilter, setReviewerFilter] = useState<string>('')
  const [inclusionFilter, setInclusionFilter] = useState<string>('')

  // Drawer / Sheet State
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit' | 'duplicate'>('create')
  const [editingJeId, setEditingJeId] = useState<number | null>(null)

  // Drawer Form State
  const [jeNumber, setJeNumber] = useState('')
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10))
  const [entityId, setEntityId] = useState<number | ''>('')
  const [scenarioId, setScenarioId] = useState<number | ''>('1') // default to scenario 1
  const [description, setDescription] = useState('')
  const [overlayGroup, setOverlayGroup] = useState('accrual')
  const [sourceRef, setSourceRef] = useState('')
  const [lines, setLines] = useState<EditLineState[]>([])
  
  // Drawer UI State
  const [drawerActiveTab, setDrawerActiveTab] = useState<'details' | 'comments' | 'history'>('details')
  const [newCommentText, setNewCommentText] = useState('')
  const [newAttachmentName, setNewAttachmentName] = useState('')
  const [apiError, setApiError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<any[]>([])

  // Signoff selection state
  const [selectedReviewerId, setSelectedReviewerId] = useState<number | ''>('')

  // Reversal Confirmation Modal
  const [reversalConfirmOpen, setReversalConfirmOpen] = useState(false)
  const [reversalJeId, setReversalJeId] = useState<number | null>(null)
  const [reversalForm, setReversalForm] = useState({
    reversal_date: new Date().toISOString().slice(0, 10),
    je_number: '',
    description: '',
  })

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  const { data: journalEntries = [], isLoading, isError, error } = useQuery({
    queryKey: ['journal-entries'],
    queryFn: () => journalEntriesApi.list(),
  })

  const { data: entities = [] } = useQuery({
    queryKey: ['entities-list'],
    queryFn: () => entitiesApi.list(),
  })

  // Periods query for filters
  const { data: filterPeriods = [] } = useQuery({
    queryKey: ['periods-list', entityFilter],
    queryFn: () => periodsApi.list(Number(entityFilter)),
    enabled: !!entityFilter,
  })

  // Users query for preparers/reviewers
  const { data: users = [] } = useQuery({
    queryKey: ['org-users', orgId],
    queryFn: () => usersApi.list(orgId),
    enabled: !!orgId,
  })

  // Active Signoffs query for editing JE
  const { data: activeSignoffs = [] } = useQuery({
    queryKey: ['signoffs', 'journal_entry', editingJeId],
    queryFn: () => workflowApi.listSignoffs('journal_entry', editingJeId!),
    enabled: !!editingJeId,
  })

  // Automatically trigger drawer if URL specifies a JE ID
  useEffect(() => {
    if (urlJeId && !isNaN(Number(urlJeId)) && journalEntries.length > 0) {
      const targetId = Number(urlJeId)
      const found = journalEntries.find(j => j.id === targetId)
      if (found) {
        handleOpenEdit(found)
      }
    }
  }, [urlJeId, journalEntries])

  // ---------------------------------------------------------------------------
  // Local storage state update wrapper
  // ---------------------------------------------------------------------------

  const updateSubstatus = (jeId: number, val: string) => {
    const updated = { ...substatusMap, [jeId]: val }
    setSubstatusMapState(updated)
    setSubstatusMap(updated)
    queryClient.invalidateQueries({ queryKey: ['journal-entries'] })
  }

  const toggleInclusionState = (jeId: number, isExcluded: boolean) => {
    const updated = { ...excludedMap, [jeId]: isExcluded }
    setExcludedMapState(updated)
    setExcludedMap(updated)
    queryClient.invalidateQueries({ queryKey: ['journal-entries'] })
  }

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  const createDraftMutation = useMutation({
    mutationFn: (data: JECreate) => journalEntriesApi.createDraft(data),
    onSuccess: (je) => {
      // Save entry type/overlay_group to DB, save substatus to localStorage
      updateSubstatus(je.id, 'draft')
      setApiError(null)
      setIsDrawerOpen(false)
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] })
    },
    onError: (err: Error) => setApiError(err.message),
  })

  const updateDraftMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: JECreate }) => journalEntriesApi.updateDraft(id, data),
    onSuccess: (je) => {
      setApiError(null)
      setIsDrawerOpen(false)
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] })
    },
    onError: (err: Error) => setApiError(err.message),
  })

  const postDraftMutation = useMutation({
    mutationFn: (id: number) => journalEntriesApi.postDraft(id),
    onSuccess: (je) => {
      setWarnings(je.warnings ?? [])
      setApiError(null)
      setIsDrawerOpen(false)
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] })
    },
    onError: (err: Error) => setApiError(err.message),
  })

  const createAndPostMutation = useMutation({
    mutationFn: (data: JECreate) => journalEntriesApi.createAndPost(data),
    onSuccess: (je) => {
      setWarnings(je.warnings ?? [])
      setApiError(null)
      setIsDrawerOpen(false)
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] })
    },
    onError: (err: Error) => setApiError(err.message),
  })

  const reverseMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => journalEntriesApi.reverse(id, data),
    onSuccess: () => {
      setReversalConfirmOpen(false)
      setApiError(null)
      setIsDrawerOpen(false)
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] })
    },
    onError: (err: Error) => {
      setReversalConfirmOpen(false)
      setApiError(err.message)
    },
  })

  // Signoff Flow Mutations
  const createSignoffMutation = useMutation({
    mutationFn: (data: any) => workflowApi.createSignoff(orgId, data),
    onSuccess: () => {
      if (editingJeId) {
        updateSubstatus(editingJeId, 'ready_for_review')
        queryClient.invalidateQueries({ queryKey: ['signoffs', 'journal_entry', editingJeId] })
      }
    },
    onError: (err: Error) => setApiError(err.message),
  })

  const approveSignoffMutation = useMutation({
    mutationFn: ({ signoffId, notes }: { signoffId: number; notes?: string }) => workflowApi.approveSignoff(signoffId, notes),
    onSuccess: () => {
      if (editingJeId) {
        updateSubstatus(editingJeId, 'reviewed')
        queryClient.invalidateQueries({ queryKey: ['signoffs', 'journal_entry', editingJeId] })
      }
    },
    onError: (err: Error) => setApiError(err.message),
  })

  const rejectSignoffMutation = useMutation({
    mutationFn: ({ signoffId, notes }: { signoffId: number; notes?: string }) => workflowApi.rejectSignoff(signoffId, notes),
    onSuccess: () => {
      if (editingJeId) {
        updateSubstatus(editingJeId, 'rejected')
        queryClient.invalidateQueries({ queryKey: ['signoffs', 'journal_entry', editingJeId] })
      }
    },
    onError: (err: Error) => setApiError(err.message),
  })

  // ---------------------------------------------------------------------------
  // Extended state resolutions per row
  // ---------------------------------------------------------------------------

  const resolvedEntries = useMemo(() => {
    return journalEntries.map((je) => {
      const isExcluded = !!excludedMap[je.id]
      const substatus = substatusMap[je.id] ?? 'draft'
      
      let finalStatus = je.status // posted, reversed
      if (je.status === 'draft') {
        if (isExcluded) finalStatus = 'excluded'
        else finalStatus = substatus
      }

      // Compute total debit/credit
      const totalDebit = je.lines.reduce((s, l) => s + parseFloat(l.debit), 0)
      const totalCredit = je.lines.reduce((s, l) => s + parseFloat(l.credit), 0)
      const outOfBalance = Math.abs(totalDebit - totalCredit) > 0.001

      // Entity code resolver
      const entity = entities.find(e => e.id === je.entity_id)

      return {
        ...je,
        resolvedStatus: finalStatus,
        totalDebit,
        totalCredit,
        outOfBalance,
        entityCode: entity?.code ?? `ENT-${je.entity_id}`,
      }
    })
  }, [journalEntries, excludedMap, substatusMap, entities])

  // Filter implementation
  const filteredEntries = useMemo(() => {
    return resolvedEntries.filter((je) => {
      // Search
      const term = searchQuery.toLowerCase()
      if (term) {
        const matchNumber = je.je_number.toLowerCase().includes(term)
        const matchDesc = je.description.toLowerCase().includes(term)
        if (!matchNumber && !matchDesc) return false
      }

      // Status
      if (statusFilter) {
        if (statusFilter === 'out_of_balance') {
          if (!je.outOfBalance) return false
        } else {
          if (je.resolvedStatus !== statusFilter) return false
        }
      }

      // Type / Group
      if (typeFilter && je.overlay_group !== typeFilter) return false

      // Entity
      if (entityFilter && je.entity_id !== Number(entityFilter)) return false

      // Period - Filter JEs within period date bounds if period selected
      if (periodFilter) {
        const period = filterPeriods.find(p => p.id === Number(periodFilter))
        if (period) {
          const entryDateObj = new Date(je.entry_date)
          const start = new Date(period.start_date)
          const end = new Date(period.end_date)
          if (entryDateObj < start || entryDateObj > end) return false
        }
      }

      // Preparer (created_by name match)
      if (preparerFilter && je.created_by !== preparerFilter) return false

      // Reviewer (signoff reviewer email or name)
      if (reviewerFilter) {
        // Simple mock match for test
        if (je.posted_by !== reviewerFilter) return false
      }

      // Inclusion State
      if (inclusionFilter) {
        const isExcluded = !!excludedMap[je.id]
        if (inclusionFilter === 'included' && isExcluded) return false
        if (inclusionFilter === 'excluded' && !isExcluded) return false
      }

      return true
    })
  }, [resolvedEntries, searchQuery, statusFilter, typeFilter, entityFilter, periodFilter, filterPeriods, preparerFilter, reviewerFilter, inclusionFilter, excludedMap])

  // ---------------------------------------------------------------------------
  // KPI Statistics
  // ---------------------------------------------------------------------------

  const kpis = useMemo(() => {
    let drafts = 0
    let readyForReview = 0
    let reviewed = 0
    let posted = 0
    let excluded = 0
    let outOfBalance = 0

    resolvedEntries.forEach((je) => {
      if (je.outOfBalance) outOfBalance++
      if (excludedMap[je.id]) {
        excluded++
        return
      }

      if (je.status === 'posted') {
        posted++
      } else if (je.status === 'draft') {
        const sub = substatusMap[je.id] ?? 'draft'
        if (sub === 'draft') drafts++
        else if (sub === 'ready_for_review') readyForReview++
        else if (sub === 'reviewed') reviewed++
      }
    })

    return { drafts, readyForReview, reviewed, posted, excluded, outOfBalance }
  }, [resolvedEntries, excludedMap, substatusMap])

  // ---------------------------------------------------------------------------
  // Drawer Form Handlers & Calculations
  // ---------------------------------------------------------------------------

  const totalDebit = lines.reduce((s, l) => s + parseDecimal(l.debit), 0)
  const totalCredit = lines.reduce((s, l) => s + parseDecimal(l.credit), 0)
  const difference = Math.abs(totalDebit - totalCredit)
  const isBalanced = difference < 0.001

  function addLine() {
    setLines((prev) => [
      ...prev,
      {
        key: generateLineKey(),
        account_id: 0,
        entity_id: entityId ? Number(entityId) : 0,
        debit: '0',
        credit: '0',
        description: '',
        _selectedAccount: null,
      },
    ])
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key))
  }

  function updateLineField(key: string, field: keyof EditLineState, value: any) {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, [field]: value } : l))
    )
  }

  function handleOpenCreate() {
    setDrawerMode('create')
    setEditingJeId(null)
    setJeNumber(`JE-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`)
    setEntryDate(new Date().toISOString().slice(0, 10))
    setEntityId(entities[0]?.id ?? '')
    setScenarioId(1)
    setDescription('')
    setOverlayGroup('accrual')
    setSourceRef('')
    setSelectedReviewerId('')
    setApiError(null)
    setWarnings([])
    setLines([
      { key: generateLineKey(), account_id: 0, entity_id: 0, debit: '0', credit: '0', description: '', _selectedAccount: null },
      { key: generateLineKey(), account_id: 0, entity_id: 0, debit: '0', credit: '0', description: '', _selectedAccount: null },
    ])
    setDrawerActiveTab('details')
    setIsDrawerOpen(true)
  }

  function handleOpenEdit(je: JournalEntry) {
    setDrawerMode('edit')
    setEditingJeId(je.id)
    setJeNumber(je.je_number)
    setEntryDate(je.entry_date)
    setEntityId(je.entity_id)
    setScenarioId(je.scenario_id)
    setDescription(je.description)
    setOverlayGroup(je.overlay_group ?? 'accrual')
    setSourceRef(je.source_ref ?? '')
    setSelectedReviewerId('')
    setApiError(null)
    setWarnings([])

    // Hydrate form lines, fetching account details if needed
    const formLines = je.lines.map((l) => ({
      key: generateLineKey(),
      id: l.id,
      account_id: l.account_id,
      entity_id: l.entity_id,
      debit: l.debit,
      credit: l.credit,
      description: l.description ?? '',
      _selectedAccount: null as Account | null, // Search will find/render properly
    }))
    setLines(formLines)
    setDrawerActiveTab('details')
    setIsDrawerOpen(true)
  }

  function handleOpenDuplicate(je: JournalEntry) {
    setDrawerMode('duplicate')
    setEditingJeId(null)
    setJeNumber(`${je.je_number}-COPY`)
    setEntryDate(new Date().toISOString().slice(0, 10))
    setEntityId(je.entity_id)
    setScenarioId(je.scenario_id)
    setDescription(`Copy of ${je.description}`)
    setOverlayGroup(je.overlay_group ?? 'accrual')
    setSourceRef(je.source_ref ?? '')
    setSelectedReviewerId('')
    setApiError(null)
    setWarnings([])

    const formLines = je.lines.map((l) => ({
      key: generateLineKey(),
      account_id: l.account_id,
      entity_id: l.entity_id,
      debit: l.debit,
      credit: l.credit,
      description: l.description ?? '',
      _selectedAccount: null as Account | null,
    }))
    setLines(formLines)
    setDrawerActiveTab('details')
    setIsDrawerOpen(true)
  }

  function buildPayload(): JECreate {
    return {
      je_number: jeNumber,
      entry_date: entryDate,
      entity_id: Number(entityId),
      scenario_id: Number(scenarioId),
      description,
      source: 'manual',
      source_ref: sourceRef || null,
      lines: lines.map((l, i) => ({
        line_number: i + 1,
        account_id: l.account_id,
        entity_id: l.entity_id || Number(entityId),
        debit: l.debit,
        credit: l.credit,
        description: l.description || null,
      })),
    }
  }

  function handleSaveForm(postDirectly = false) {
    if (!entityId) {
      setApiError('An entity must be selected.')
      return
    }
    const payload = buildPayload()

    if (postDirectly) {
      if (!isBalanced) {
        setApiError('Debits and credits must balance before posting.')
        return
      }
      createAndPostMutation.mutate(payload)
    } else {
      if (drawerMode === 'create' || drawerMode === 'duplicate') {
        createDraftMutation.mutate(payload)
      } else if (drawerMode === 'edit' && editingJeId !== null) {
        updateDraftMutation.mutate({ id: editingJeId, data: payload })
      }
    }
  }

  // Submit signoff request
  function handleSubmitSignoff() {
    if (!editingJeId || !selectedReviewerId) return
    createSignoffMutation.mutate({
      object_type: 'journal_entry',
      object_id: editingJeId,
      reviewer_user_id: Number(selectedReviewerId),
      notes: `Review request for adjusting entry ${jeNumber}`,
    })
  }

  // Approver / Rejector
  function handleSignoffDecision(action: 'approve' | 'reject', signoffId: number) {
    const notes = prompt(`Reviewer notes (optional) for adjusting entry ${jeNumber}:`) || ''
    if (action === 'approve') {
      approveSignoffMutation.mutate({ signoffId, notes })
    } else {
      rejectSignoffMutation.mutate({ signoffId, notes })
    }
  }

  // Reverse posted JE triggers reversing confirm dialog
  function triggerReverse(je: JournalEntry) {
    setReversalJeId(je.id)
    setReversalForm({
      reversal_date: new Date().toISOString().slice(0, 10),
      je_number: `REV-${je.je_number}`,
      description: `Reversal of entry ${je.je_number} - ${je.description}`,
    })
    setReversalConfirmOpen(true)
  }

  // ---------------------------------------------------------------------------
  // Comments Tab Operations (LocalStorage simulated)
  // ---------------------------------------------------------------------------

  const activeComments = useMemo(() => {
    if (!editingJeId) return []
    return commentsMap[editingJeId] ?? []
  }, [editingJeId, commentsMap])

  function handleAddComment() {
    if (!editingJeId || !newCommentText.trim()) return
    const comment = {
      author: users[0]?.full_name ?? 'Advisor User',
      text: newCommentText,
      timestamp: new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    }
    const updated = {
      ...commentsMap,
      [editingJeId]: [...activeComments, comment]
    }
    setCommentsMapState(updated)
    setCommentsMap(updated)
    setNewCommentText('')
  }

  // ---------------------------------------------------------------------------
  // Attachments Tab Operations (LocalStorage simulated)
  // ---------------------------------------------------------------------------

  const activeAttachments = useMemo(() => {
    if (!editingJeId) return []
    return attachmentsMap[editingJeId] ?? []
  }, [editingJeId, attachmentsMap])

  function handleAddAttachment() {
    if (!editingJeId || !newAttachmentName.trim()) return
    const updated = {
      ...attachmentsMap,
      [editingJeId]: [...activeAttachments, newAttachmentName.trim()]
    }
    setAttachmentsMapState(updated)
    setAttachmentsMap(updated)
    setNewAttachmentName('')
  }

  // ---------------------------------------------------------------------------
  // Grid Columns Configuration
  // ---------------------------------------------------------------------------

  const columns = useMemo<GridColumn<any>[]>(() => [
    {
      key: 'je_number',
      header: 'JE Number',
      sortable: true,
      sortValue: (r) => r.je_number,
      render: (r) => (
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs font-bold text-slate-800">{r.je_number}</span>
          {r.status === 'draft' && (
            <span className="text-[9px] bg-slate-100 text-slate-500 border border-slate-200/80 px-1 py-0.5 rounded font-semibold uppercase tracking-wider scale-90">Draft</span>
          )}
        </div>
      )
    },
    {
      key: 'entry_date',
      header: 'Date',
      sortable: true,
      sortValue: (r) => r.entry_date,
      render: (r) => <span className="text-slate-600 font-semibold">{r.entry_date}</span>
    },
    {
      key: 'entity',
      header: 'Entity',
      sortable: true,
      sortValue: (r) => r.entityCode,
      render: (r) => <span className="text-slate-500 font-medium font-mono text-[11px] uppercase bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded-lg">{r.entityCode}</span>
    },
    {
      key: 'description',
      header: 'Description',
      sortable: true,
      sortValue: (r) => r.description,
      render: (r) => <span className="text-slate-700 truncate max-w-xs block font-medium" title={r.description}>{r.description}</span>
    },
    {
      key: 'type',
      header: 'Type',
      sortable: true,
      sortValue: (r) => r.overlay_group,
      render: (r) => (
        <span className="inline-block text-[11px] bg-slate-50 text-slate-600 border border-slate-200 rounded px-2 py-0.5 capitalize font-semibold font-sans">
          {(r.overlay_group ?? 'accrual').replace(/_/g, ' ')}
        </span>
      )
    },
    {
      key: 'debit',
      header: 'Debit',
      sortable: true,
      sortValue: (r) => r.totalDebit,
      render: (r) => <span className="font-mono text-slate-750 text-right w-full block pr-1 tabular-nums font-semibold">${r.totalDebit.toFixed(2)}</span>
    },
    {
      key: 'credit',
      header: 'Credit',
      sortable: true,
      sortValue: (r) => r.totalCredit,
      render: (r) => <span className="font-mono text-slate-750 text-right w-full block pr-1 tabular-nums font-semibold">${r.totalCredit.toFixed(2)}</span>
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      sortValue: (r) => r.resolvedStatus,
      render: (r) => {
        const config = STATUS_COLOR_CLASSES[r.resolvedStatus] ?? STATUS_COLOR_CLASSES.draft
        return (
          <span className={cn("inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase border shadow-xs select-none", config.badge)}>
            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", config.dot)} />
            {r.resolvedStatus.replace(/_/g, ' ')}
          </span>
        )
      }
    },
    {
      key: 'created_by',
      header: 'Preparer',
      render: (r) => <span className="text-slate-500 font-semibold">{r.created_by ?? '—'}</span>
    },
    {
      key: 'posted_by',
      header: 'Reviewer',
      render: (r) => <span className="text-slate-500 font-semibold">{r.posted_by ?? '—'}</span>
    },
  ], [entities])

  // Row actions configuration
  const rowActions = useMemo<RowAction<any>[]>(() => [
    {
      key: 'edit',
      label: 'Edit Entry',
      onClick: (r) => handleOpenEdit(r),
      disabled: (r) => r.status === 'posted' || r.status === 'reversed'
    },
    {
      key: 'duplicate',
      label: 'Duplicate',
      onClick: (r) => handleOpenDuplicate(r)
    },
    {
      key: 'reverse',
      label: 'Reverse JE',
      onClick: (r) => triggerReverse(r),
      hidden: (r) => r.status !== 'posted'
    },
    {
      key: 'submit',
      label: 'Submit for Review',
      onClick: (r) => handleOpenEdit(r),
      hidden: (r) => r.status !== 'draft'
    }
  ], [])

  // Batch actions configuration
  const batchActions = useMemo<BatchAction<any>[]>(() => [
    {
      key: 'bulk_post',
      label: 'Post Selected',
      onClick: async (rows) => {
        const drafts = rows.filter(r => r.status === 'draft')
        if (drafts.length === 0) {
          alert('No draft entries selected.')
          return
        }
        if (window.confirm(`Post the ${drafts.length} selected draft journal entries to the ledger?`)) {
          for (const d of drafts) {
            try {
              await journalEntriesApi.postDraft(d.id)
            } catch (err: any) {
              alert(`Failed to post ${d.je_number}: ${err.message}`)
            }
          }
          queryClient.invalidateQueries({ queryKey: ['journal-entries'] })
        }
      }
    },
    {
      key: 'bulk_exclude',
      label: 'Exclude from Previews',
      onClick: (rows) => {
        const drafts = rows.filter(r => r.status === 'draft')
        const updated = { ...excludedMap }
        drafts.forEach(d => {
          updated[d.id] = true
        })
        setExcludedMapState(updated)
        setExcludedMap(updated)
        queryClient.invalidateQueries({ queryKey: ['journal-entries'] })
      }
    },
    {
      key: 'bulk_include',
      label: 'Include in Previews',
      onClick: (rows) => {
        const drafts = rows.filter(r => r.status === 'draft')
        const updated = { ...excludedMap }
        drafts.forEach(d => {
          updated[d.id] = false
        })
        setExcludedMapState(updated)
        setExcludedMap(updated)
        queryClient.invalidateQueries({ queryKey: ['journal-entries'] })
      }
    }
  ], [excludedMap])

  return (
    <>
      {/* Reversal Confirmation Dialog */}
      <ConfirmDialog
        open={reversalConfirmOpen}
        onOpenChange={setReversalConfirmOpen}
        title="Reverse Adjusted Journal Entry"
        description="This creates a reversing entry with inverted sign balances on the specified date. This operation is permanent."
        confirmLabel="Reverse Entry"
        destructive
        onConfirm={() => {
          if (reversalJeId !== null) {
            reverseMutation.mutate({
              id: reversalJeId,
              data: {
                reversal_date: reversalForm.reversal_date,
                je_number: reversalForm.je_number,
                description: reversalForm.description,
                created_by: 'Advisor System'
              }
            })
          }
        }}
      >
        <div className="mt-4 space-y-3">
          <Input
            label="Reversal Entry Date"
            type="date"
            value={reversalForm.reversal_date}
            onChange={(e) => setReversalForm({ ...reversalForm, reversal_date: e.target.value })}
            required
          />
          <Input
            label="Reversal JE Number"
            value={reversalForm.je_number}
            onChange={(e) => setReversalForm({ ...reversalForm, je_number: e.target.value })}
            required
          />
          <Input
            label="Reversal Description"
            value={reversalForm.description}
            onChange={(e) => setReversalForm({ ...reversalForm, description: e.target.value })}
            required
          />
        </div>
      </ConfirmDialog>

      <PageLayout
        title="Journal Entries"
        subtitle="Power workbench to draft, review, and post Adjusting Journal Entries (AJEs) for client accounting cleanup"
        actions={
          <button
            type="button"
            onClick={handleOpenCreate}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-650 text-white rounded-lg hover:bg-indigo-700 text-xs font-bold shadow-xs hover:shadow-sm cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Create Journal Entry
          </button>
        }
      >
        {apiError && <ErrorBanner message={apiError} />}
        {warnings.length > 0 && (
          <div className="bg-amber-50 border border-amber-200/80 rounded-xl px-4 py-3 text-sm text-amber-800 mb-4">
            <h4 className="font-semibold text-xs text-amber-800 mb-1">Post Warning Warnings</h4>
            <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-amber-700">
              {warnings.map((w, idx) => (
                <li key={idx}>{w.message}</li>
              ))}
            </ul>
          </div>
        )}

        {/* 1. Top KPI Summary Strip */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 mb-5">
          {[
            { label: 'Draft', count: kpis.drafts, filter: 'draft', activeColor: 'border-indigo-500 bg-indigo-50/20 text-indigo-750' },
            { label: 'Ready for Review', count: kpis.readyForReview, filter: 'ready_for_review', activeColor: 'border-amber-400 bg-amber-50/20 text-amber-700' },
            { label: 'Reviewed', count: kpis.reviewed, filter: 'reviewed', activeColor: 'border-teal-400 bg-teal-50/20 text-teal-750' },
            { label: 'Posted', count: kpis.posted, filter: 'posted', activeColor: 'border-emerald-500 bg-emerald-50/20 text-emerald-750' },
            { label: 'Excluded', count: kpis.excluded, filter: 'excluded', activeColor: 'border-slate-400 bg-slate-100/50 text-slate-600' },
            { label: 'Out of Balance', count: kpis.outOfBalance, filter: 'out_of_balance', activeColor: 'border-rose-400 bg-rose-50/20 text-rose-750' },
          ].map((k) => (
            <button
              key={k.label}
              type="button"
              onClick={() => setStatusFilter(statusFilter === k.filter ? '' : k.filter)}
              className={cn(
                "border border-slate-200/80 bg-white rounded-xl px-4 py-3 text-left shadow-xs transition-all select-none hover:border-slate-350 cursor-pointer flex flex-col justify-between min-h-[72px]",
                statusFilter === k.filter && k.activeColor
              )}
            >
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">{k.label}</span>
              <span className="text-xl font-bold font-mono tracking-tight text-slate-800">{k.count}</span>
            </button>
          ))}
        </div>

        {/* 2. Grid toolbar and interactive filter panel */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-4 mb-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-indigo-500" /> Filter adjustment workbench
            </span>
            {(searchQuery || statusFilter || typeFilter || entityFilter || periodFilter || preparerFilter || reviewerFilter || inclusionFilter) && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('')
                  setStatusFilter('')
                  setTypeFilter('')
                  setEntityFilter('')
                  setPeriodFilter('')
                  setPreparerFilter('')
                  setReviewerFilter('')
                  setInclusionFilter('')
                }}
                className="text-[11px] text-indigo-650 hover:underline font-bold cursor-pointer"
              >
                Clear all filters
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            {/* Search Input */}
            <div className="flex flex-col gap-1 col-span-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Search</label>
              <div className="relative">
                <Search className="absolute left-2 top-2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="JE # or description…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg pl-7 pr-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Status Selector */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
              >
                <option value="">All Statuses</option>
                {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                <option value="out_of_balance">Out of Balance</option>
              </select>
            </div>

            {/* Type Selector */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Type</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
              >
                <option value="">All Types</option>
                {ENTRY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            {/* Entity Selector */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Entity</label>
              <select
                value={entityFilter}
                onChange={(e) => {
                  setEntityFilter(e.target.value)
                  setPeriodFilter('')
                }}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
              >
                <option value="">All Entities</option>
                {entities.map(ent => <option key={ent.id} value={ent.id}>{ent.code} - {ent.name}</option>)}
              </select>
            </div>

            {/* Period Selector */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Period</label>
              <select
                value={periodFilter}
                onChange={(e) => setPeriodFilter(e.target.value)}
                disabled={!entityFilter}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white disabled:opacity-50"
              >
                <option value="">All Periods</option>
                {filterPeriods.map(p => <option key={p.id} value={p.id}>{p.period_name}</option>)}
              </select>
            </div>

            {/* Preparer Selector */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Preparer</label>
              <select
                value={preparerFilter}
                onChange={(e) => setPreparerFilter(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
              >
                <option value="">All Preparers</option>
                {Array.from(new Set(resolvedEntries.map(e => e.created_by).filter(Boolean))).map(name => (
                  <option key={name} value={name!}>{name}</option>
                ))}
              </select>
            </div>

            {/* Inclusion filter */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Inclusion</label>
              <select
                value={inclusionFilter}
                onChange={(e) => setInclusionFilter(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
              >
                <option value="">All Inclusions</option>
                <option value="included">Included only</option>
                <option value="excluded">Excluded only</option>
              </select>
            </div>
          </div>
        </div>

        {/* 3. Main DataGrid table list */}
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message={(error as Error).message} />
        ) : (
          <AccountingDataGrid
            columns={columns}
            data={filteredEntries}
            rowKey={(r) => r.id}
            rowActions={rowActions}
            batchActions={batchActions}
            selectionEnabled={true}
            searchPlaceholder="Search journal entries…"
            exportFilename={`adjusting_journal_entries_${org?.name ?? 'client'}`}
            onRowClick={(r) => handleOpenEdit(r)}
            rowClassName={(r) => {
              if (r.resolvedStatus === 'excluded') return 'opacity-65 line-through bg-slate-50/40 text-slate-400'
              if (r.resolvedStatus === 'posted') return 'border-l-4 border-l-emerald-500'
              if (r.resolvedStatus === 'ready_for_review') return 'bg-amber-50/10'
              return undefined
            }}
          />
        )}
      </PageLayout>

      {/* 4. Slide-Out Edit/Create Drawer Sheet */}
      <Dialog.Root open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40 transition-opacity animate-in fade-in" />
          <Dialog.Content className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-2xl bg-white shadow-2xl border-l border-slate-200 flex flex-col focus:outline-none animate-in slide-in-from-right duration-250">
            
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b bg-slate-55">
              <div>
                <Dialog.Title className="text-base font-bold text-slate-900 flex items-center gap-2">
                  {drawerMode === 'create' ? 'Create Adjusting Journal Entry' : drawerMode === 'duplicate' ? 'Duplicate Journal Entry' : `Review Entry: ${jeNumber}`}
                  {editingJeId !== null && (
                    <span className={cn("inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase border shadow-xs tracking-wider", STATUS_COLOR_CLASSES[substatusMap[editingJeId] ?? 'draft']?.badge)}>
                      {substatusMap[editingJeId] ?? 'draft'}
                    </span>
                  )}
                </Dialog.Title>
                <Dialog.Description className="text-xs text-slate-500">
                  {drawerMode === 'create' ? 'Define a new draft journal entry' : `JE #${jeNumber} · Adjusting details`}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button type="button" className="rounded p-1 hover:bg-slate-250 text-slate-500 hover:text-slate-800 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </Dialog.Close>
            </div>

            {/* Tab selection list if in review/edit mode */}
            {editingJeId !== null && (
              <div className="flex border-b border-slate-200 bg-slate-50 px-5 gap-1.5">
                {[
                  { id: 'details', label: 'Details' },
                  { id: 'comments', label: 'Comments' },
                  { id: 'history', label: 'History & Signoffs' },
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => setDrawerActiveTab(t.id as any)}
                    className={cn(
                      "px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer",
                      drawerActiveTab === t.id
                        ? "border-indigo-600 text-indigo-600 font-extrabold"
                        : "border-transparent text-slate-500 hover:text-slate-800"
                    )}
                  >
                    {t.label}
                    {t.id === 'comments' && activeComments.length > 0 && (
                      <span className="ml-1 bg-slate-200 text-slate-700 px-1 rounded-full text-[9px] font-bold">{activeComments.length}</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Main scrollable body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">

              {/* DETAILS / EDIT TAB */}
              {drawerActiveTab === 'details' && (
                <div className="space-y-6">

                  {/* 1. Header controls card */}
                  <div className="bg-slate-50/50 border border-slate-200/80 rounded-xl p-4 space-y-4 shadow-xs">
                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5"><SlidersHorizontal className="w-3.5 h-3.5" /> Header Fields</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        label="JE Number"
                        value={jeNumber}
                        onChange={(e) => setJeNumber(e.target.value)}
                        placeholder="JE-2024-001"
                        required
                        disabled={drawerMode === 'edit' && editingJeId !== null}
                      />
                      <Input
                        label="Entry Date"
                        type="date"
                        value={entryDate}
                        onChange={(e) => setEntryDate(e.target.value)}
                        required
                      />
                      <EntitySelect
                        label="Legal Entity"
                        value={entityId}
                        onChange={(id) => {
                          setEntityId(id)
                          // propagate default entity ID to rows
                          setLines(prev => prev.map(l => ({ ...l, entity_id: Number(id) })))
                        }}
                        required
                      />
                      <div>
                        <label className="text-xs font-semibold text-slate-700 mb-1 block">Entry Type</label>
                        <select
                          value={overlayGroup}
                          onChange={(e) => setOverlayGroup(e.target.value)}
                          className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white"
                        >
                          {ENTRY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>
                      <Input
                        label="Source Ref"
                        value={sourceRef}
                        onChange={(e) => setSourceRef(e.target.value)}
                        placeholder="e.g. lease agreement, auditor req"
                      />
                      <Input
                        label="Scenario ID"
                        type="number"
                        value={String(scenarioId)}
                        onChange={(e) => setScenarioId(Number(e.target.value) || '')}
                        required
                      />
                    </div>
                    <Textarea
                      label="JE Description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Purpose of this cleanup adjusting entry…"
                      rows={2}
                      required
                    />
                  </div>

                  {/* 2. Inclusion control card (Draft overlays sync) */}
                  {editingJeId !== null && (
                    <div className="bg-amber-50/30 border border-amber-200/80 rounded-xl p-4 flex items-center justify-between shadow-xs">
                      <div className="flex items-start gap-2">
                        <Eye className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-xs font-semibold text-slate-800">Draft Inclusion State</p>
                          <p className="text-[11px] text-slate-500 leading-relaxed">
                            {excludedMap[editingJeId]
                              ? 'This draft is Excluded. It will not affect draft preview overlay reports.'
                              : 'This draft is Included. It will flow automatically into pro forma draft preview reports.'
                            }
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleInclusionState(editingJeId, !excludedMap[editingJeId])}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer select-none",
                          excludedMap[editingJeId]
                            ? "bg-slate-800 text-white border-slate-700"
                            : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                        )}
                      >
                        {excludedMap[editingJeId] ? 'Include Entry' : 'Exclude Entry'}
                      </button>
                    </div>
                  )}

                  {/* 3. Multi-line journal lines items grid */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5" /> Lines ({lines.length})</span>
                      <button
                        type="button"
                        onClick={addLine}
                        className="flex items-center gap-1 text-[11px] font-bold text-indigo-650 hover:underline cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add line item
                      </button>
                    </div>

                    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs bg-white">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-55 border-b border-slate-200/80 text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                          <tr>
                            <th className="px-3 py-2 text-left w-8">#</th>
                            <th className="px-3 py-2 text-left">Account</th>
                            <th className="px-3 py-2 text-right w-24">Debit</th>
                            <th className="px-3 py-2 text-right w-24">Credit</th>
                            <th className="px-3 py-2 text-left min-w-[120px]">Description</th>
                            <th className="px-3 py-2 w-8" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {lines.map((line, idx) => (
                            <tr key={line.key} className="hover:bg-slate-50/40">
                              <td className="px-3 py-2 text-slate-400 font-semibold">{idx + 1}</td>
                              <td className="px-2 py-2">
                                <AccountSearch
                                  entityId={entityId}
                                  value={line.account_id || null}
                                  onChange={(acct) => {
                                    updateLineField(line.key, 'account_id', acct?.id ?? 0)
                                    updateLineField(line.key, '_selectedAccount', acct)
                                  }}
                                />
                              </td>
                              <td className="px-2 py-2">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={line.debit}
                                  onChange={(e) => updateLineField(line.key, 'debit', e.target.value)}
                                  className="w-24 border border-slate-200 rounded px-2 py-1 text-right focus:outline-none focus:ring-2 focus:ring-indigo-500/15"
                                  aria-label={`Debit row ${idx + 1}`}
                                />
                              </td>
                              <td className="px-2 py-2">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={line.credit}
                                  onChange={(e) => updateLineField(line.key, 'credit', e.target.value)}
                                  className="w-24 border border-slate-200 rounded px-2 py-1 text-right focus:outline-none focus:ring-2 focus:ring-indigo-500/15"
                                  aria-label={`Credit row ${idx + 1}`}
                                />
                              </td>
                              <td className="px-2 py-2">
                                <input
                                  type="text"
                                  placeholder="description (optional)"
                                  value={line.description}
                                  onChange={(e) => updateLineField(line.key, 'description', e.target.value)}
                                  className="w-full border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500/15"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <button
                                  type="button"
                                  disabled={lines.length <= 2}
                                  onClick={() => removeLine(line.key)}
                                  className="text-slate-400 hover:text-red-600 disabled:opacity-30 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Debit / Credit Validation Panel */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex justify-between items-center text-xs shadow-sm">
                      <div className="flex gap-4">
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">Total Debits</span>
                          <span className="font-mono font-bold text-slate-700">${totalDebit.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">Total Credits</span>
                          <span className="font-mono font-bold text-slate-700">${totalCredit.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">Variance</span>
                          <span className="font-mono font-bold text-slate-700">${difference.toFixed(2)}</span>
                        </div>
                      </div>
                      <div>
                        {isBalanced ? (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-250 px-2 py-0.5 rounded-full">
                            <Check className="w-3 h-3" /> Balanced
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-rose-600 bg-rose-50 border border-rose-250 px-2 py-0.5 rounded-full">
                            <AlertTriangle className="w-3 h-3 animate-bounce" /> Out of Balance
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 4. Workflow signoff review submission */}
                  {editingJeId !== null && substatusMap[editingJeId] === 'draft' && (
                    <div className="bg-indigo-50/30 border border-indigo-200/80 rounded-xl p-4 space-y-3 shadow-xs">
                      <h4 className="text-xs font-semibold text-slate-800 flex items-center gap-1"><Send className="w-3.5 h-3.5" /> Submit for Review</h4>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        Submit this entry for review. Select a reviewer from organization members to dispatch approval notifications.
                      </p>
                      <div className="flex items-center gap-2">
                        <select
                          value={selectedReviewerId}
                          onChange={(e) => setSelectedReviewerId(e.target.value)}
                          className="flex-1 text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white"
                        >
                          <option value="">Choose reviewer…</option>
                          {users.map(u => <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>)}
                        </select>
                        <button
                          type="button"
                          onClick={handleSubmitSignoff}
                          disabled={!selectedReviewerId || createSignoffMutation.isPending}
                          className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
                        >
                          {createSignoffMutation.isPending ? 'Submitting…' : 'Submit Review'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 5. Active reviewer approve/reject panel */}
                  {editingJeId !== null && activeSignoffs.length > 0 && (
                    <div className="bg-slate-55 border border-slate-200 rounded-xl p-4 space-y-3 shadow-xs">
                      <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5"><ShieldAlert className="w-3.5 h-3.5 text-amber-500" /> Pending Review Decisions</h4>
                      <div className="space-y-2">
                        {activeSignoffs.map((s: Signoff) => {
                          const reviewer = users.find(u => u.id === s.reviewer_user_id)
                          return (
                            <div key={s.id} className="flex justify-between items-center border border-slate-200/80 bg-white rounded-lg p-2.5 shadow-sm text-xs">
                              <div>
                                <p className="font-semibold text-slate-700">{reviewer?.full_name ?? `Reviewer #${s.reviewer_user_id}`}</p>
                                <p className="text-[10px] text-slate-400 font-medium">Status: {s.signoff_status.toUpperCase()}</p>
                              </div>
                              {s.signoff_status === 'pending' && (
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => handleSignoffDecision('approve', s.id)}
                                    className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold cursor-pointer transition-colors"
                                  >
                                    <Check className="w-3 h-3" /> Approve
                                  </button>
                                  <button
                                    onClick={() => handleSignoffDecision('reject', s.id)}
                                    className="flex items-center gap-1 px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-[10px] font-bold cursor-pointer transition-colors"
                                  >
                                    <X className="w-3 h-3" /> Reject
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                </div>
              )}

              {/* COMMENTS TAB */}
              {drawerActiveTab === 'comments' && (
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5"><MessageSquare className="w-4 h-4 text-indigo-500" /> Review Notes</h3>
                  <div className="space-y-2">
                    {activeComments.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-6 border border-dashed rounded-lg bg-slate-50/50">No review comments yet. Add the first note below.</p>
                    ) : (
                      activeComments.map((c, idx) => (
                        <div key={idx} className="bg-slate-50 border border-slate-200 p-3 rounded-lg text-xs space-y-1 shadow-sm">
                          <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold">
                            <span>{c.author}</span>
                            <span>{c.timestamp}</span>
                          </div>
                          <p className="text-slate-700 font-semibold leading-relaxed">{c.text}</p>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="border-t pt-4 space-y-2">
                    <Textarea
                      placeholder="Write comment or review note…"
                      value={newCommentText}
                      onChange={(e) => setNewCommentText(e.target.value)}
                      rows={3}
                    />
                    <button
                      type="button"
                      onClick={handleAddComment}
                      disabled={!newCommentText.trim()}
                      className="px-3.5 py-1.5 bg-slate-800 text-white font-bold rounded-lg text-xs hover:bg-slate-700 cursor-pointer disabled:opacity-50"
                    >
                      Post Note
                    </button>
                  </div>

                  {/* Supporting documentation / attachments */}
                  <div className="border-t pt-5 space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5"><Paperclip className="w-4 h-4 text-indigo-500" /> Support Attachments</h3>
                    <div className="space-y-2">
                      {activeAttachments.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-4 border border-dashed rounded-lg bg-slate-50/50">No files attached.</p>
                      ) : (
                        activeAttachments.map((f, idx) => (
                          <div key={idx} className="flex justify-between items-center bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-xs shadow-sm">
                            <span className="font-semibold text-slate-700 truncate">{f}</span>
                            <span className="text-[10px] bg-slate-200 text-slate-600 border px-1.5 py-0.5 rounded font-bold uppercase">Uploaded</span>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Fake lease agreement.pdf…"
                        value={newAttachmentName}
                        onChange={(e) => setNewAttachmentName(e.target.value)}
                        className="flex-1 text-xs border border-slate-250 rounded-lg px-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={handleAddAttachment}
                        disabled={!newAttachmentName.trim()}
                        className="px-3.5 py-1.5 border border-slate-250 rounded-lg text-xs font-bold bg-white text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                      >
                        Attach
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* HISTORY & TIMELINE TAB */}
              {drawerActiveTab === 'history' && (
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5"><History className="w-4 h-4 text-indigo-500" /> Timeline Logs</h3>
                  
                  <div className="relative pl-6 border-l border-slate-200 space-y-6">
                    {/* Creation step */}
                    <div className="relative">
                      <span className="absolute -left-[30px] top-1.5 w-3 h-3 rounded-full bg-indigo-600 border-2 border-white ring-4 ring-indigo-50" />
                      <div className="text-xs">
                        <p className="font-bold text-slate-800">Draft Prepared</p>
                        <p className="text-[10px] text-slate-400">Advisor Agent · Created manually</p>
                      </div>
                    </div>

                    {/* Submission step */}
                    {editingJeId !== null && (substatusMap[editingJeId] !== 'draft') && (
                      <div className="relative">
                        <span className="absolute -left-[30px] top-1.5 w-3 h-3 rounded-full bg-amber-500 border-2 border-white ring-4 ring-amber-50" />
                        <div className="text-xs">
                          <p className="font-bold text-slate-800">Submitted for Review</p>
                          <p className="text-[10px] text-slate-400">Request posted to signoffs ledger</p>
                        </div>
                      </div>
                    )}

                    {/* Reviewed step */}
                    {editingJeId !== null && (substatusMap[editingJeId] === 'reviewed' || substatusMap[editingJeId] === 'posted') && (
                      <div className="relative">
                        <span className="absolute -left-[30px] top-1.5 w-3 h-3 rounded-full bg-teal-500 border-2 border-white ring-4 ring-teal-50" />
                        <div className="text-xs">
                          <p className="font-bold text-slate-800">Reviewed &amp; Approved</p>
                          <p className="text-[10px] text-slate-400">Signoff marked approved</p>
                        </div>
                      </div>
                    )}

                    {/* Posted step */}
                    {editingJeId !== null && journalEntries.find(j => j.id === editingJeId)?.status === 'posted' && (
                      <div className="relative">
                        <span className="absolute -left-[30px] top-1.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white ring-4 ring-emerald-50" />
                        <div className="text-xs">
                          <p className="font-bold text-slate-800 text-emerald-750">Posted to Ledger</p>
                          <p className="text-[10px] text-slate-400">Applying calculations to official reports</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>

            {/* Drawer Footer Actions */}
            <div className="flex justify-end gap-3 px-5 py-4 border-t bg-slate-55 sticky bottom-0 z-10">
              
              {/* Reset/Cancel */}
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 cursor-pointer shadow-xs"
                >
                  Cancel
                </button>
              </Dialog.Close>

              {/* Duplicate option if viewing details */}
              {editingJeId !== null && (
                <button
                  type="button"
                  onClick={() => {
                    const found = journalEntries.find(j => j.id === editingJeId)
                    if (found) handleOpenDuplicate(found)
                  }}
                  className="rounded-lg border border-slate-350 px-4 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 cursor-pointer shadow-xs flex items-center gap-1"
                >
                  <Copy className="w-3.5 h-3.5" /> Duplicate
                </button>
              )}

              {/* Reversal action if posted */}
              {editingJeId !== null && journalEntries.find(j => j.id === editingJeId)?.status === 'posted' && (
                <button
                  type="button"
                  onClick={() => {
                    const found = journalEntries.find(j => j.id === editingJeId)
                    if (found) triggerReverse(found)
                  }}
                  className="rounded-lg bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 text-xs font-bold cursor-pointer shadow-xs flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Reverse Entry
                </button>
              )}

              {/* Actions for drafts: Save Draft, Post */}
              {drawerActiveTab === 'details' && (editingJeId === null || journalEntries.find(j => j.id === editingJeId)?.status === 'draft') && (
                <>
                  <button
                    type="button"
                    onClick={() => handleSaveForm(false)}
                    disabled={createDraftMutation.isPending || updateDraftMutation.isPending}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    {createDraftMutation.isPending || updateDraftMutation.isPending ? 'Saving…' : 'Save Draft'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (editingJeId !== null) {
                        // Simply post the already saved draft
                        postDraftMutation.mutate(editingJeId)
                      } else {
                        // Create and post instantly
                        handleSaveForm(true)
                      }
                    }}
                    disabled={
                      !isBalanced ||
                      createAndPostMutation.isPending ||
                      postDraftMutation.isPending ||
                      (editingJeId !== null && substatusMap[editingJeId] !== 'reviewed' && substatusMap[editingJeId] !== 'draft') // require review if ready
                    }
                    className="rounded-lg bg-indigo-650 hover:bg-indigo-700 text-white px-4 py-2 text-xs font-bold disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    {createAndPostMutation.isPending || postDraftMutation.isPending ? 'Posting…' : 'Post to Ledger'}
                  </button>
                </>
              )}

            </div>

          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
