import { NextResponse } from 'next/server'
import { getApiSession } from '@/lib/auth'
import { createServerSupabase } from '@/lib/supabase/server'
import { buildWidgets, type Widget } from '@/lib/analytics/widgets'
import { okDatasetFromRow, type DatasetDbRow } from '@/lib/dataset/fromRow'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getApiSession()
  if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const { id } = await params
  const supabase = await createServerSupabase() // RLS отфильтрует недопущенных

  const { data: sheets, error } = await supabase
    .from('table_sheets')
    .select('id, title, sheet_index, datasets(status, header_row, start_col, end_col, end_row, confidence, columns, rows)')
    .eq('table_id', id)
    .order('sheet_index')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const result = (sheets ?? []).map((s) => {
    const raw = (Array.isArray(s.datasets) ? s.datasets[0] : s.datasets) as DatasetDbRow | null
    const dataset = okDatasetFromRow(raw)
    if (!dataset) {
      // status 'ok' без columns/rows (битая строка) показываем как empty
      const status = raw?.status === 'needs_mapping' ? 'needs_mapping' as const : 'empty' as const
      return { sheetId: s.id, title: s.title, status, widgets: [] as Widget[], truncated: 0 }
    }
    const { widgets, truncated } = buildWidgets(dataset)
    return { sheetId: s.id, title: s.title, status: 'ok' as const, widgets, truncated }
  })
  return NextResponse.json({ sheets: result })
}
