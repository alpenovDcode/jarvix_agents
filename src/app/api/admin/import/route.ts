import { NextResponse } from 'next/server'
import { getApiSession } from '@/lib/auth'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { runImportBatch, syncCatalog } from '@/lib/import/importTable'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  const session = await getApiSession()
  if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Только для администратора' }, { status: 403 })

  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const admin = createAdminSupabase()
  let total: number | undefined
  if (body.sync) total = (await syncCatalog(admin)).total
  const result = await runImportBatch(admin, 45_000, { retryErrors: Boolean(body.retryErrors) })
  return NextResponse.json({ ...result, total })
}
