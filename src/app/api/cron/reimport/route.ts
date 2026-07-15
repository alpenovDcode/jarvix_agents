import { NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { runImportBatch, syncCatalog } from '@/lib/import/importTable'

export const runtime = 'nodejs'
export const maxDuration = 60

async function handle(request: Request) {
  // fail-closed: без настроенного секрета эндпоинт закрыт (иначе подошёл бы literal 'Bearer undefined')
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const admin = createAdminSupabase()
  await syncCatalog(admin)
  const result = await runImportBatch(admin, 45_000)
  return NextResponse.json(result)
}

export async function GET(request: Request) { return handle(request) }  // Vercel cron ходит GET'ом
export async function POST(request: Request) { return handle(request) } // pg_cron ходит POST'ом
