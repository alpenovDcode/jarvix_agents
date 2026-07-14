import type { CellScalar, SheetSnapshot } from '@/lib/types'

export const CONFIDENCE_THRESHOLD = 0.55

export function snapshotToMatrix(snapshot: SheetSnapshot): CellScalar[][] {
  const rowIdx = Object.keys(snapshot.cellData).map(Number)
  if (!rowIdx.length) return []
  const maxRow = Math.max(...rowIdx)
  let maxCol = 0
  for (const r of rowIdx) {
    const cols = Object.keys(snapshot.cellData[r]).map(Number)
    if (cols.length) maxCol = Math.max(maxCol, ...cols)
  }
  const matrix: CellScalar[][] = []
  for (let r = 0; r <= maxRow; r++) {
    const row: CellScalar[] = []
    for (let c = 0; c <= maxCol; c++) {
      const v = snapshot.cellData[r]?.[c]?.v
      row.push(v === undefined ? null : v)
    }
    matrix.push(row)
  }
  return matrix
}

export interface DataRange { headerRow: number; startCol: number; endCol: number; endRow: number; confidence: number }

const isEmpty = (v: CellScalar): boolean => v === null || v === ''

/** Заголовок — непустая строка, не являющаяся числом. */
function isHeaderish(v: CellScalar): boolean {
  if (typeof v !== 'string') return false
  const t = v.trim()
  if (!t) return false
  return Number.isNaN(Number(t.replace(',', '.').replace(/\s/g, '')))
}

function scoreCandidate(matrix: CellScalar[][], headerRow: number): DataRange | null {
  const row = matrix[headerRow] ?? []
  const nonEmptyIdx = row.map((v, i) => (isEmpty(v) ? -1 : i)).filter((i) => i >= 0)
  if (nonEmptyIdx.length < 2) return null
  const stringRatio = nonEmptyIdx.filter((i) => isHeaderish(row[i])).length / nonEmptyIdx.length
  if (stringRatio < 0.6) return null

  const startCol = nonEmptyIdx[0]
  const endCol = nonEmptyIdx[nonEmptyIdx.length - 1]

  let endRow = headerRow
  let emptyStreak = 0
  for (let r = headerRow + 1; r < matrix.length; r++) {
    const hasData = (matrix[r] ?? []).slice(startCol, endCol + 1).some((v) => !isEmpty(v))
    if (hasData) {
      endRow = r
      emptyStreak = 0
    } else if (++emptyStreak >= 3) break
  }
  if (endRow === headerRow) return null

  const titles = nonEmptyIdx.map((i) => String(row[i]).trim().toLowerCase())
  const uniqueness = new Set(titles).size / titles.length

  let filled = 0
  let total = 0
  const colConsistency: number[] = []
  for (let c = startCol; c <= endCol; c++) {
    const kinds = new Map<string, number>()
    let colNonEmpty = 0
    for (let r = headerRow + 1; r <= endRow; r++) {
      total++
      const v = matrix[r]?.[c] ?? null
      if (isEmpty(v)) continue
      filled++
      colNonEmpty++
      kinds.set(typeof v, (kinds.get(typeof v) ?? 0) + 1)
    }
    colConsistency.push(colNonEmpty === 0 ? 0 : Math.max(...kinds.values()) / colNonEmpty)
  }
  const fillRatio = total === 0 ? 0 : filled / total
  const typeConsistency = colConsistency.reduce((a, b) => a + b, 0) / colConsistency.length

  const confidence = 0.35 * stringRatio + 0.2 * uniqueness + 0.2 * fillRatio + 0.25 * typeConsistency
  return { headerRow, startCol, endCol, endRow, confidence: Math.round(confidence * 100) / 100 }
}

export function detectDataRange(matrix: CellScalar[][]): DataRange | null {
  const scanLimit = Math.min(matrix.length, 20)
  let best: DataRange | null = null
  for (let r = 0; r < scanLimit; r++) {
    const candidate = scoreCandidate(matrix, r)
    if (candidate && (!best || candidate.confidence > best.confidence)) best = candidate
  }
  return best
}
