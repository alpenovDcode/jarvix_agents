import type { SupabaseClient } from '@supabase/supabase-js'
import { convertGridSheet, summarizeReports, type GoogleGridSheet } from '@/lib/google/convert'
import { buildDataset } from '@/lib/dataset/build'
import { fetchSpreadsheetGrid, listFolderSpreadsheets } from '@/lib/google/client'
import type { CellScalar, DatasetBuild, DatasetColumn, SheetImportReport } from '@/lib/types'

export function needsImport(t: { google_modified_at: string | null; last_imported_at: string | null }): boolean {
  if (!t.last_imported_at) return true
  if (!t.google_modified_at) return false
  return new Date(t.google_modified_at).getTime() > new Date(t.last_imported_at).getTime()
}

/** Обновляет каталог таблиц из Drive (названия, папки, modifiedTime, новые файлы). */
export async function syncCatalog(admin: SupabaseClient): Promise<{ total: number }> {
  const files = await listFolderSpreadsheets(process.env.GOOGLE_DRIVE_FOLDER_ID!)
  if (files.length) {
    const { error } = await admin.from('tables').upsert(
      files.map((f) => ({
        google_spreadsheet_id: f.id,
        title: f.name,
        folder: f.folder,
        google_modified_at: f.modifiedTime,
      })),
      { onConflict: 'google_spreadsheet_id' },
    )
    if (error) throw new Error(`syncCatalog: ${error.message}`)
  }
  return { total: files.length }
}

interface DatasetRow {
  sheet_id: string
  status: 'ok' | 'needs_mapping' | 'empty'
  header_row: number | null
  start_col: number | null
  end_col: number | null
  end_row: number | null
  confidence: number | null
  columns: DatasetColumn[] | null
  rows: CellScalar[][] | null
}

function datasetToRow(sheetId: string, d: DatasetBuild): DatasetRow {
  if (d.status === 'ok') {
    return {
      sheet_id: sheetId, status: 'ok', header_row: d.headerRow,
      start_col: d.range.startCol, end_col: d.range.endCol, end_row: d.range.endRow,
      confidence: d.confidence, columns: d.columns, rows: d.rows,
    }
  }
  return {
    sheet_id: sheetId, status: d.status, header_row: null,
    start_col: null, end_col: null, end_row: null,
    confidence: d.status === 'needs_mapping' ? d.confidence : null, columns: null, rows: null,
  }
}

export async function importTable(admin: SupabaseClient, table: { id: string; google_spreadsheet_id: string }): Promise<void> {
  const gridSheets = await fetchSpreadsheetGrid(table.google_spreadsheet_id)
  const reports: SheetImportReport[] = []
  const keptSheetIds: number[] = []

  for (let i = 0; i < gridSheets.length; i++) {
    const gs = gridSheets[i] as GoogleGridSheet
    const googleSheetId = gs.properties?.sheetId ?? i
    const { snapshot, report } = convertGridSheet(gs, i)
    reports.push(report)
    keptSheetIds.push(googleSheetId)

    const { data: sheetRow, error } = await admin
      .from('table_sheets')
      .upsert(
        { table_id: table.id, google_sheet_id: googleSheetId, title: snapshot.name, sheet_index: gs.properties?.index ?? i, snapshot },
        { onConflict: 'table_id,google_sheet_id' },
      )
      .select('id')
      .single()
    if (error) throw new Error(`table_sheets: ${error.message}`)

    const { error: dsError } = await admin
      .from('datasets')
      .upsert(datasetToRow(sheetRow.id, buildDataset(snapshot)), { onConflict: 'sheet_id' })
    if (dsError) throw new Error(`datasets: ${dsError.message}`)
  }

  if (keptSheetIds.length) {
    await admin.from('table_sheets').delete()
      .eq('table_id', table.id)
      .not('google_sheet_id', 'in', `(${keptSheetIds.join(',')})`)
  }

  await admin.from('tables').update({
    import_status: 'ok',
    import_error: null,
    import_report: summarizeReports(reports),
    last_imported_at: new Date().toISOString(),
  }).eq('id', table.id)
}

export interface BatchResult { imported: number; remaining: number; errors: { table: string; message: string }[] }

export async function runImportBatch(admin: SupabaseClient, budgetMs: number, opts: { retryErrors?: boolean } = {}): Promise<BatchResult> {
  const started = Date.now()
  const { data, error } = await admin
    .from('tables')
    .select('id, google_spreadsheet_id, title, import_status, google_modified_at, last_imported_at')
    .eq('mode', 'google-owned')
    .order('last_imported_at', { ascending: true, nullsFirst: true })
  if (error) throw new Error(error.message)

  const queue = (data ?? []).filter((t) => needsImport(t) || (opts.retryErrors && t.import_status === 'error'))
  const errors: BatchResult['errors'] = []
  let processed = 0

  for (const t of queue) {
    if (Date.now() - started > budgetMs) break
    try {
      await importTable(admin, t)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      errors.push({ table: t.title, message })
      // last_imported_at ставим и при ошибке — иначе битая таблица зациклит очередь;
      // повторная попытка: при изменении файла в Google или кнопкой «повторить с ошибками»
      await admin.from('tables').update({
        import_status: 'error', import_error: message, last_imported_at: new Date().toISOString(),
      }).eq('id', t.id)
    }
    processed++
  }
  return { imported: processed, remaining: Math.max(0, queue.length - processed), errors }
}
