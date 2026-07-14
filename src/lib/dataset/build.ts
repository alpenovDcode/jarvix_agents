import type { CellScalar, ColumnType, DatasetBuild, DatasetColumn, SheetSnapshot } from '@/lib/types'
import { CONFIDENCE_THRESHOLD, detectDataRange, snapshotToMatrix } from '@/lib/dataset/detect'
import { inferColumnType, parseNumberLike, parseRuDate, serialToISO } from '@/lib/dataset/infer'

function normalize(v: CellScalar, type: ColumnType): CellScalar {
  if (v === null || v === '') return null
  switch (type) {
    case 'date':
      if (typeof v === 'number') return serialToISO(v)
      if (typeof v === 'string') return parseRuDate(v)
      return null
    case 'number':
    case 'money':
    case 'percent':
      return parseNumberLike(v) // PERCENT-формат Google уже хранит долю; строки '15%' parseNumberLike делит на 100
    default:
      return typeof v === 'string' ? v.trim() : v
  }
}

export function buildDataset(snapshot: SheetSnapshot): DatasetBuild {
  const matrix = snapshotToMatrix(snapshot)
  if (!matrix.length) return { status: 'empty' }
  const range = detectDataRange(matrix)
  if (!range) return { status: 'needs_mapping', confidence: 0 }
  if (range.confidence < CONFIDENCE_THRESHOLD) return { status: 'needs_mapping', confidence: range.confidence }

  const nfType = (r: number, c: number): string | null => {
    const styleId = snapshot.cellData[r]?.[c]?.s
    return styleId ? (snapshot.styles[styleId]?.nfType ?? null) : null
  }

  const { headerRow, startCol, endCol, endRow } = range
  const columns: DatasetColumn[] = []
  for (let c = startCol; c <= endCol; c++) {
    const raw = matrix[headerRow][c]
    const title = raw === null || raw === '' ? `Колонка ${c + 1}` : String(raw).trim()
    const values: CellScalar[] = []
    const nfTypes: (string | null)[] = []
    for (let r = headerRow + 1; r <= endRow; r++) {
      values.push(matrix[r]?.[c] ?? null)
      nfTypes.push(nfType(r, c))
    }
    columns.push({ index: c, key: `c${c}`, title, type: inferColumnType(values, { nfTypes, title }) })
  }

  const rows: CellScalar[][] = []
  for (let r = headerRow + 1; r <= endRow; r++) {
    const row = columns.map((col) => normalize(matrix[r]?.[col.index] ?? null, col.type))
    if (row.some((v) => v !== null && v !== '')) rows.push(row)
  }

  return { status: 'ok', headerRow, range: { startCol, endCol, endRow }, confidence: range.confidence, columns, rows }
}
