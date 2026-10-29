'use client'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/spa/components/shared'
import { navigate } from '@/spa/router'

export default function NotFoundPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24">
      <EmptyState
        title="Page not found"
        description="The link may be outdated or mistyped."
        action={<Button onClick={() => navigate('/')}>Back to home</Button>}
      />
    </div>
  )
}
