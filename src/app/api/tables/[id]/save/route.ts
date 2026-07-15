import { NextResponse } from 'next/server'
import { getApiSession } from '@/lib/auth'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { buildDataset } from '@/lib/dataset/build'
import { datasetToRow } from '@/lib/dataset/fromRow'
import type { MergeRange, SheetSnapshot, SnapshotCell } from '@/lib/types'

export const runtime = 'nodejs'

interface SaveBody { googleSheetId: number; cellData: SheetSnapshot['cellData']; mergeData?: MergeRange[] }

function isCellData(v: unknown): v is Record<number, Record<number, SnapshotCell>> {
  return typeof v === 'object' && v !== null
}

// Сохранение правок листа из редактора Univer: обновляем значения (cellData) и
// объединения, СОХРАНЯЯ стили/ширины из прежнего снапшота (правка значений их не меняет),
// затем пересобираем dataset — Realtime по datasets поднимет свежую аналитику/сводку.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getApiSession()
  if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params
  const body = (await request.json().catch(() => null)) as SaveBody | null
  if (!body || typeof body.googleSheetId !== 'number' || !isCellData(body.cellData)) {
    return NextResponse.json({ error: 'Некорректные данные' }, { status: 400 })
  }

  const admin = createAdminSupabase()
  const { data: sheet, error } = await admin
    .from('table_sheets')
    .select('id, snapshot')
    .eq('table_id', id)
    .eq('google_sheet_id', body.googleSheetId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!sheet) return NextResponse.json({ error: 'Лист не найден' }, { status: 404 })

  const prev = sheet.snapshot as SheetSnapshot
  const snapshot: SheetSnapshot = { ...prev, cellData: body.cellData, mergeData: body.mergeData ?? prev.mergeData }

  const { error: upErr } = await admin.from('table_sheets').update({ snapshot }).eq('id', sheet.id)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const dataset = buildDataset(snapshot)
  const { error: dsErr } = await admin
    .from('datasets')
    .update({ ...datasetToRow(dataset), built_at: new Date().toISOString() })
    .eq('sheet_id', sheet.id)
  if (dsErr) return NextResponse.json({ error: dsErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, dataset: dataset.status })
}
