# Accounting Tool — Frontend

React + TypeScript + Vite frontend for the accounting tool API.

## Stack

- **React 19** + **TypeScript**
- **Vite** (build + dev server)
- **TailwindCSS v4** (utility-first CSS)
- **TanStack Query** (server state)
- **React Router v7** (client routing)
- **Axios** (HTTP client)
- **Radix UI** + **class-variance-authority** (accessible primitives + variant styling)
- **Vitest** + **Testing Library** (unit tests)

## Getting started

```bash
npm install
npm run dev       # dev server
npm test          # run tests
npm run build     # production build
```

## Environment

Copy `.env.example` to `.env.local`:

```
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

## Architecture

```
src/
├── api/          # Axios client + per-resource API modules
├── components/   # Shared UI components (Badge, DataTable, etc.)
├── layouts/      # AppShell, Sidebar, TopNav
├── pages/        # Route-level page components
├── hooks/        # Custom React hooks (future)
├── types/        # TypeScript domain types (mirrors Pydantic schemas)
├── routes/       # AppRouter — central route definition
├── providers/    # OrgProvider (org context + API header injection)
├── utils/        # cn() class helper
└── test/         # Vitest + Testing Library tests
```

## Organization context

`OrgProvider` holds the active organization. When set, it automatically injects
`X-Organization-Id` on every API request via the Axios interceptor.
`X-User-Id` is wired the same way for future JWT auth.

## No authentication yet

JWT/session auth is deferred to a later milestone. The `X-User-Id` header
placeholder requires no frontend restructuring to replace.
