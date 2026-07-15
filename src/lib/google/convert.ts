import type { MergeRange, SheetImportReport, SheetSnapshot, SnapshotCell, SnapshotStyle, TableImportReport } from '@/lib/types'

// Минимальные типы ответа Sheets API (структурно совместимы с sheets_v4.Schema$Sheet)
export interface GoogleCellFormat {
  backgroundColor?: { red?: number; green?: number; blue?: number }
  textFormat?: { bold?: boolean; italic?: boolean; fontSize?: number }
  horizontalAlignment?: string
  numberFormat?: { type?: string; pattern?: string }
}
export interface GoogleCellData {
  userEnteredValue?: { formulaValue?: string }
  effectiveValue?: { numberValue?: number; stringValue?: string; boolValue?: boolean }
  effectiveFormat?: GoogleCellFormat
}
export interface GoogleGridSheet {
  properties?: { sheetId?: number; title?: string; index?: number; gridProperties?: { rowCount?: number; columnCount?: number } }
  data?: { startRow?: number; startColumn?: number; rowData?: { values?: GoogleCellData[] }[] }[]
  merges?: { startRowIndex?: number; endRowIndex?: number; startColumnIndex?: number; endColumnIndex?: number }[]
}

/** Google-специфичные функции: в Univer не работают, замораживаем в значение. */
const FROZEN_FUNCTIONS = [
  'IMPORTRANGE', 'QUERY', 'IMPORTXML', 'IMPORTHTML', 'IMPORTDATA', 'IMPORTFEED',
  'IMAGE', 'SPARKLINE', 'GOOGLEFINANCE', 'GOOGLETRANSLATE', 'DETECTLANGUAGE',
  'ARRAYFORMULA', 'FLATTEN', 'SORTN', 'LABEL', 'CONTINUE',
]
const FROZEN_RE = new RegExp(`(^|[^A-Z0-9_.])(${FROZEN_FUNCTIONS.join('|')})\\s*\\(`)

export function isFrozenFormula(formula: string): string | null {
  const m = FROZEN_RE.exec(formula.toUpperCase())
  return m ? m[2] : null
}

export function toA1(row: number, col: number): string {
  let letters = ''
  let n = col
  do {
    letters = String.fromCharCode(65 + (n % 26)) + letters
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return `${letters}${row + 1}`
}

function channelToHex(c = 0): string {
  return Math.round(c * 255).toString(16).padStart(2, '0')
}

const HT_MAP: Record<string, 1 | 2 | 3> = { LEFT: 1, CENTER: 2, RIGHT: 3 }

function extractStyle(fmt?: GoogleCellFormat): SnapshotStyle | null {
  if (!fmt) return null
  const s: SnapshotStyle = {}
  if (fmt.backgroundColor) {
    const hex = `#${channelToHex(fmt.backgroundColor.red)}${channelToHex(fmt.backgroundColor.green)}${channelToHex(fmt.backgroundColor.blue)}`
    if (hex !== '#ffffff') s.bg = { rgb: hex }
  }
  if (fmt.textFormat?.bold) s.bl = 1
  if (fmt.textFormat?.italic) s.it = 1
  if (fmt.textFormat?.fontSize && fmt.textFormat.fontSize !== 10) s.fs = fmt.textFormat.fontSize
  const ht = fmt.horizontalAlignment ? HT_MAP[fmt.horizontalAlignment] : undefined
  if (ht) s.ht = ht
  if (fmt.numberFormat?.pattern) s.n = { pattern: fmt.numberFormat.pattern }
  if (fmt.numberFormat?.type) s.nfType = fmt.numberFormat.type
  return Object.keys(s).length ? s : null
}

// Пределы снапшота: Univer не рендерит сетку больше этих размеров,
// поэтому и ячейки за пределами не сохраняем — иначе таблица и аналитика разойдутся.
const ROW_LIMIT = 10000
const COL_LIMIT = 200

export function convertGridSheet(sheet: GoogleGridSheet, sheetIndex: number): { snapshot: SheetSnapshot; report: SheetImportReport } {
  const title = sheet.properties?.title ?? `Лист ${sheetIndex + 1}`
  // стили неймспейсим по СТАБИЛЬНОМУ google sheetId, не по индексу цикла импорта:
  // индекс меняется при переупорядочивании листов, и частично обновлённые снапшоты
  // разных прогонов коллидировали бы ключами в общей styles-карте workbook
  const styleNs = sheet.properties?.sheetId ?? sheetIndex
  const cellData: SheetSnapshot['cellData'] = {}
  const styles: Record<string, SnapshotStyle> = {}
  const styleIds = new Map<string, string>()
  const report: SheetImportReport = { sheetTitle: title, cellCount: 0, formulaCount: 0, frozenFormulas: [], warnings: [] }
  let maxRow = -1
  let maxCol = -1
  let clipped = 0

  for (const block of sheet.data ?? []) {
    const rowOffset = block.startRow ?? 0
    const colOffset = block.startColumn ?? 0
    ;(block.rowData ?? []).forEach((rowData, ri) => {
      ;(rowData.values ?? []).forEach((cell, ci) => {
        const row = rowOffset + ri
        const col = colOffset + ci
        if (row >= ROW_LIMIT || col >= COL_LIMIT) { clipped++; return }
        const out: SnapshotCell = {}
        const ev = cell.effectiveValue
        if (ev?.numberValue !== undefined) out.v = ev.numberValue
        else if (ev?.stringValue !== undefined) out.v = ev.stringValue
        else if (ev?.boolValue !== undefined) out.v = ev.boolValue
        const formula = cell.userEnteredValue?.formulaValue
        if (formula) {
          report.formulaCount++
          const frozenFn = isFrozenFormula(formula)
          if (frozenFn) {
            out.custom = { frozenFormula: formula }
            report.frozenFormulas.push({ a1: toA1(row, col), fn: frozenFn })
          } else {
            out.f = formula
          }
        }
        const style = extractStyle(cell.effectiveFormat)
        if (style) {
          const key = JSON.stringify(style)
          let id = styleIds.get(key)
          if (!id) {
            id = `s${styleNs}_${styleIds.size}`
            styleIds.set(key, id)
            styles[id] = style
          }
          out.s = id
        }
        if (out.v === undefined && !out.f && !out.s && !out.custom) return
        ;(cellData[row] ??= {})[col] = out
        report.cellCount++
        if (row > maxRow) maxRow = row
        if (col > maxCol) maxCol = col
      })
    })
  }

  const mergeData: MergeRange[] = (sheet.merges ?? []).map((m) => ({
    startRow: m.startRowIndex ?? 0,
    endRow: (m.endRowIndex ?? 1) - 1,
    startColumn: m.startColumnIndex ?? 0,
    endColumn: (m.endColumnIndex ?? 1) - 1,
  }))

  if (clipped > 0) {
    report.warnings.push(`Обрезано ${clipped} ячеек за пределами ${ROW_LIMIT}×${COL_LIMIT} — лист больше лимита снапшота`)
  }

  const snapshot: SheetSnapshot = {
    name: title,
    rowCount: Math.min(Math.max(maxRow + 51, 100), ROW_LIMIT),
    columnCount: Math.min(Math.max(maxCol + 6, 26), COL_LIMIT),
    cellData,
    mergeData,
    styles,
  }
  return { snapshot, report }
}

export function summarizeReports(sheets: SheetImportReport[]): TableImportReport {
  const totalCells = sheets.reduce((acc, s) => acc + s.cellCount, 0)
  const totalFormulas = sheets.reduce((acc, s) => acc + s.formulaCount, 0)
  const totalFrozen = sheets.reduce((acc, s) => acc + s.frozenFormulas.length, 0)
  const totalWarnings = sheets.reduce((acc, s) => acc + s.warnings.length, 0)
  return { sheets, totalCells, totalFormulas, totalFrozen, status: totalFrozen + totalWarnings > 0 ? 'warnings' : 'clean' }
}
