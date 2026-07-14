import type { SheetSnapshot } from '@/lib/types'

/** Разбор CSV с поддержкой кавычек и экранированных кавычек. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows
}

/** Матрица строк CSV → снапшот в формате Univer (значения как есть; типизацию делает buildDataset). */
export function matrixToSnapshot(matrix: string[][], name = 'Лист1'): SheetSnapshot {
  const cellData: SheetSnapshot['cellData'] = {}
  matrix.forEach((r, ri) => {
    r.forEach((v, ci) => {
      if (v !== '') (cellData[ri] ??= {})[ci] = { v }
    })
  })
  const cols = Math.max(1, ...matrix.map((r) => r.length))
  return { name, rowCount: matrix.length + 10, columnCount: cols + 2, cellData, mergeData: [], styles: {} }
}
