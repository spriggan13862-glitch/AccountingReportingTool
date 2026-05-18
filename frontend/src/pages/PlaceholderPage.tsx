import { PageLayout } from '@/components/ui/PageLayout'

interface PlaceholderPageProps {
  title: string
}

export function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <PageLayout title={title}>
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center">
        <p className="text-sm text-gray-500">Coming soon.</p>
        <p className="mt-1 text-xs text-gray-400">
          This page will surface {title.toLowerCase()} data from the API.
        </p>
      </div>
    </PageLayout>
  )
}
