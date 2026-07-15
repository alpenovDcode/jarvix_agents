export type CellScalar = string | number | boolean | null

export interface BorderLine { s: number; cl: { rgb: string } }   // s — Univer BorderStyleTypes
export interface BorderSet { t?: BorderLine; b?: BorderLine; l?: BorderLine; r?: BorderLine }

export interface SnapshotStyle {
  bg?: { rgb: string }        // '#rrggbb' — заливка
  cl?: { rgb: string }        // '#rrggbb' — цвет текста
  bl?: 0 | 1                  // bold
  it?: 0 | 1                  // italic
  fs?: number                 // размер шрифта
  ff?: string                 // семейство шрифта
  ht?: 0 | 1 | 2 | 3          // horizontal align: unset/left/center/right
  vt?: 0 | 1 | 2 | 3          // vertical align: unset/top/middle/bottom
  bd?: BorderSet              // границы ячейки
  n?: { pattern: string }     // числовой формат Univer
  nfType?: string             // тип формата Google (DATE, PERCENT, CURRENCY…) — наше расширение
}

export interface SnapshotCell {
  v?: string | number | boolean   // вычисленное значение
  f?: string                      // формула '=SUM(A1:A2)' (совместимая)
  s?: string                      // id стиля
  custom?: { frozenFormula?: string } // замороженная Google-специфичная формула
}

export interface MergeRange { startRow: number; endRow: number; startColumn: number; endColumn: number }

export interface SheetSnapshot {
  name: string
  rowCount: number
  columnCount: number
  cellData: Record<number, Record<number, SnapshotCell>>
  mergeData: MergeRange[]
  styles: Record<string, SnapshotStyle>   // ключи уникальны в рамках листа: s{sheetIndex}_{n}
  columnWidths?: Record<number, number>   // индекс колонки → ширина в px
  rowHeights?: Record<number, number>     // индекс строки → высота в px
}

export type ColumnType = 'number' | 'money' | 'percent' | 'date' | 'category' | 'id' | 'text'

export interface DatasetColumn { index: number; key: string; title: string; type: ColumnType }

export type DatasetBuild =
  | { status: 'ok'; headerRow: number; range: { startCol: number; endCol: number; endRow: number }
      confidence: number; columns: DatasetColumn[]; rows: CellScalar[][] }
  | { status: 'needs_mapping'; confidence: number }
  | { status: 'empty' }

export interface SheetImportReport {
  sheetTitle: string
  cellCount: number
  formulaCount: number
  frozenFormulas: { a1: string; fn: string }[]
  warnings: string[]
}

export interface TableImportReport {
  sheets: SheetImportReport[]
  totalCells: number
  totalFormulas: number
  totalFrozen: number
  status: 'clean' | 'warnings'
}
