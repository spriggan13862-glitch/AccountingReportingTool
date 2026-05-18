import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Badge, StatusBadge, SeverityBadge, PriorityBadge } from '@/components/ui/Badge'

describe('Badge', () => {
  it('renders children', () => {
    render(<Badge>hello</Badge>)
    expect(screen.getByText('hello')).toBeInTheDocument()
  })

  it('applies success variant class', () => {
    render(<Badge variant="success">ok</Badge>)
    const el = screen.getByText('ok')
    expect(el.className).toContain('green')
  })

  it('applies error variant class', () => {
    render(<Badge variant="error">fail</Badge>)
    const el = screen.getByText('fail')
    expect(el.className).toContain('red')
  })
})

describe('StatusBadge', () => {
  it.each([
    ['posted', 'posted'],
    ['draft', 'draft'],
    ['completed', 'completed'],
    ['pending', 'pending'],
    ['failed', 'failed'],
    ['rejected', 'rejected'],
  ])('renders status %s', (status, expectedText) => {
    render(<StatusBadge status={status} />)
    expect(screen.getByText(expectedText.replace('_', ' '))).toBeInTheDocument()
  })

  it('uses success variant for posted', () => {
    render(<StatusBadge status="posted" />)
    expect(screen.getByText('posted').className).toContain('green')
  })

  it('uses error variant for failed', () => {
    render(<StatusBadge status="failed" />)
    expect(screen.getByText('failed').className).toContain('red')
  })
})

describe('SeverityBadge', () => {
  it.each(['info', 'warning', 'error', 'critical'])('renders severity %s', (sev) => {
    render(<SeverityBadge severity={sev} />)
    expect(screen.getByText(sev)).toBeInTheDocument()
  })
})

describe('PriorityBadge', () => {
  it.each(['low', 'medium', 'high', 'critical'])('renders priority %s', (p) => {
    render(<PriorityBadge priority={p} />)
    expect(screen.getByText(p)).toBeInTheDocument()
  })
})
