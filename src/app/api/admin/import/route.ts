import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { runImportBatch, syncCatalog } from '@/lib/import/importTable'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  const g = await requireAdminApi()
  if ('error' in g) return g.error

  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const admin = createAdminSupabase()
  let total: number | undefined
  if (body.sync) total = (await syncCatalog(admin)).total
  const result = await runImportBatch(admin, 45_000, { retryErrors: Boolean(body.retryErrors) })
  return NextResponse.json({ ...result, total })
}
