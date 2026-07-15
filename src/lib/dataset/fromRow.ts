import type { OkDataset } from '@/lib/analytics/widgets'
import type { CellScalar, DatasetBuild, DatasetColumn } from '@/lib/types'

/** Строка public.datasets, как её отдаёт Supabase (все поля кроме status nullable). */
export interface DatasetDbRow {
  status: 'ok' | 'needs_mapping' | 'empty'
  header_row: number | null
  start_col: number | null
  end_col: number | null
  end_row: number | null
  confidence: number | null
  columns: DatasetColumn[] | null
  rows: CellScalar[][] | null
}

/**
 * snake_case строка БД → OkDataset. Единственное место преобразования:
 * null-поля коалесируются одинаково для всех потребителей (API аналитики, сводка).
 */
export function okDatasetFromRow(d: DatasetDbRow | null | undefined): OkDataset | null {
  if (!d || d.status !== 'ok' || !d.columns || !d.rows) return null
  return {
    status: 'ok',
    headerRow: d.header_row ?? 0,
    confidence: d.confidence ?? 0,
    range: { startCol: d.start_col ?? 0, endCol: d.end_col ?? 0, endRow: d.end_row ?? 0 },
    columns: d.columns,
    rows: d.rows,
  }
}

/** DatasetBuild → колонки строки public.datasets (обратное okDatasetFromRow). */
export function datasetToRow(d: DatasetBuild): DatasetDbRow {
  if (d.status === 'ok') {
    return {
      status: 'ok', header_row: d.headerRow, start_col: d.range.startCol, end_col: d.range.endCol,
      end_row: d.range.endRow, confidence: d.confidence, columns: d.columns, rows: d.rows,
    }
  }
  return {
    status: d.status, header_row: null, start_col: null, end_col: null, end_row: null,
    confidence: d.status === 'needs_mapping' ? d.confidence : null, columns: null, rows: null,
  }
}
