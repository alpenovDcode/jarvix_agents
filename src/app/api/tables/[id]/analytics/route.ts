import { NextResponse } from 'next/server'
import { getApiSession } from '@/lib/auth'
import { createServerSupabase } from '@/lib/supabase/server'
import { buildWidgets, type OkDataset, type Widget } from '@/lib/analytics/widgets'

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
    const raw = Array.isArray(s.datasets) ? s.datasets[0] : s.datasets
    const ds = raw as {
      status: 'ok' | 'needs_mapping' | 'empty'
      header_row: number | null; start_col: number | null; end_col: number | null; end_row: number | null
      confidence: number | null; columns: OkDataset['columns'] | null; rows: OkDataset['rows'] | null
    } | null
    if (!ds || ds.status !== 'ok' || !ds.columns || !ds.rows) {
      return { sheetId: s.id, title: s.title, status: (ds?.status ?? 'empty') as 'needs_mapping' | 'empty', widgets: [] as Widget[], truncated: 0 }
    }
    const dataset: OkDataset = {
      status: 'ok', headerRow: ds.header_row ?? 0, confidence: ds.confidence ?? 0,
      range: { startCol: ds.start_col ?? 0, endCol: ds.end_col ?? 0, endRow: ds.end_row ?? 0 },
      columns: ds.columns, rows: ds.rows,
    }
    const { widgets, truncated } = buildWidgets(dataset)
    return { sheetId: s.id, title: s.title, status: 'ok' as const, widgets, truncated }
  })
  return NextResponse.json({ sheets: result })
}
