import type { ReactNode, ElementType } from 'react'

// ---------------------------------------------------------------------------
// Core grid types
// ---------------------------------------------------------------------------

export type SortDir = 'asc' | 'desc' | null
export type GridDensity = 'compact' | 'normal' | 'comfortable'

export interface GridCellContext {
  depth: number
  isSelected: boolean
  isExpanded: boolean
  toggleExpand: () => void
}

export interface GridColumn<T> {
  key: string
  header: string
  width?: string
  hidden?: boolean
  sortable?: boolean
  filterable?: boolean
  /** 'text' for contains filter (default), 'numeric' for min/max range, 'checklist' for enum selection */
  filterType?: 'text' | 'numeric' | 'checklist'
  /** Static list of values for checklist filter mode */
  checklistValues?: string[]
  /** Sorting + global search: extract comparable primitive */
  sortValue?: (row: T) => string | number | null | undefined
  /** Override search text (defaults to sortValue) */
  filterValue?: (row: T) => string
  render: (row: T, ctx: GridCellContext) => ReactNode
  noExport?: boolean
  csvValue?: (row: T) => string
  className?: string
  headerClassName?: string
}

// ---------------------------------------------------------------------------
// Row & batch actions
// ---------------------------------------------------------------------------

export interface RowAction<T> {
  key: string
  label: string
  icon?: ElementType
  variant?: 'default' | 'danger' | 'warning'
  separator?: boolean
  disabled?: (row: T) => boolean
  hidden?: (row: T) => boolean
  onClick: (row: T) => void
}

export interface BatchAction<T> {
  key: string
  label: string
  icon?: ElementType
  variant?: 'default' | 'danger'
  disabled?: (rows: T[]) => boolean
  onClick: (rows: T[]) => void | Promise<void>
}

// ---------------------------------------------------------------------------
// Grid state
// ---------------------------------------------------------------------------

export type ColumnFilterMode = 'contains' | 'blank' | 'nonblank'

export interface GridState {
  search: string
  sortKey: string | null
  sortDir: SortDir
  page: number
  pageSize: number
  density: GridDensity
  hiddenColumns: Set<string>
  columnFilters: Record<string, string>
  columnFilterModes: Record<string, ColumnFilterMode>
  columnFilterMin: Record<string, string>
  columnFilterMax: Record<string, string>
  /** Selected values for checklist filters; key → array of selected option strings */
  columnFilterChecklists: Record<string, string[]>
}

// ---------------------------------------------------------------------------
// Hierarchy support
// ---------------------------------------------------------------------------

export interface HierarchyConfig<T> {
  getChildren: (row: T) => T[]
  getId: (row: T) => string | number
  /** Depths at which rows can be expanded */
  maxDepth?: number
}

// ---------------------------------------------------------------------------
// Export hooks
// ---------------------------------------------------------------------------

export type ExportFormat = 'csv' | 'xlsx'

export interface ExportConfig<T> {
  filename: string
  formats?: ExportFormat[]
  transform?: (rows: T[]) => Record<string, string>[]
}

// ---------------------------------------------------------------------------
// Undo hook
// ---------------------------------------------------------------------------

export interface UndoConfig {
  onUndo?: () => void
  onRedo?: () => void
  canUndo?: boolean
  canRedo?: boolean
  undoLabel?: string
  redoLabel?: string
}
