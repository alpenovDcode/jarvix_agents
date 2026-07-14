import { describe, it, expect } from 'vitest'
import { convertGridSheet, isFrozenFormula, summarizeReports, toA1, type GoogleGridSheet } from '@/lib/google/convert'

function sheetWith(rowData: NonNullable<NonNullable<GoogleGridSheet['data']>[number]['rowData']>): GoogleGridSheet {
  return { properties: { sheetId: 11, title: 'Лист1', index: 0 }, data: [{ rowData }] }
}

describe('toA1', () => {
  it('преобразует индексы в A1', () => {
    expect(toA1(0, 0)).toBe('A1')
    expect(toA1(4, 2)).toBe('C5')
    expect(toA1(0, 26)).toBe('AA1')
  })
})

describe('isFrozenFormula', () => {
  it('находит Google-специфичные функции', () => {
    expect(isFrozenFormula('=IMPORTRANGE("url";"A1:B2")')).toBe('IMPORTRANGE')
    expect(isFrozenFormula('=SUM(QUERY(A1:B2,"select *"))')).toBe('QUERY')
  })
  it('не трогает совместимые формулы и похожие имена', () => {
    expect(isFrozenFormula('=SUM(A1:A10)')).toBeNull()
    expect(isFrozenFormula('=MYQUERY(A1)')).toBeNull()
  })
})

describe('convertGridSheet', () => {
  it('переносит значения трёх типов', () => {
    const { snapshot, report } = convertGridSheet(sheetWith([
      { values: [
        { effectiveValue: { stringValue: 'Канал' } },
        { effectiveValue: { numberValue: 42.5 } },
        { effectiveValue: { boolValue: true } },
      ] },
    ]), 0)
    expect(snapshot.cellData[0][0].v).toBe('Канал')
    expect(snapshot.cellData[0][1].v).toBe(42.5)
    expect(snapshot.cellData[0][2].v).toBe(true)
    expect(report.cellCount).toBe(3)
  })

  it('сохраняет совместимую формулу вместе со значением', () => {
    const { snapshot, report } = convertGridSheet(sheetWith([
      { values: [{ userEnteredValue: { formulaValue: '=SUM(B2:B9)' }, effectiveValue: { numberValue: 100 } }] },
    ]), 0)
    expect(snapshot.cellData[0][0]).toMatchObject({ v: 100, f: '=SUM(B2:B9)' })
    expect(report.formulaCount).toBe(1)
    expect(report.frozenFormulas).toHaveLength(0)
  })

  it('замораживает IMPORTRANGE: значение остаётся, формула в custom', () => {
    const { snapshot, report } = convertGridSheet(sheetWith([
      { values: [{ userEnteredValue: { formulaValue: '=IMPORTRANGE("x";"A1")' }, effectiveValue: { numberValue: 7 } }] },
    ]), 0)
    const cell = snapshot.cellData[0][0]
    expect(cell.v).toBe(7)
    expect(cell.f).toBeUndefined()
    expect(cell.custom?.frozenFormula).toBe('=IMPORTRANGE("x";"A1")')
    expect(report.frozenFormulas).toEqual([{ a1: 'A1', fn: 'IMPORTRANGE' }])
  })

  it('дедуплицирует стили и учитывает смещение блока', () => {
    const bold = { textFormat: { bold: true } }
    const { snapshot } = convertGridSheet({
      properties: { sheetId: 1, title: 'S', index: 2 },
      data: [{ startRow: 3, startColumn: 1, rowData: [
        { values: [{ effectiveValue: { stringValue: 'a' }, effectiveFormat: bold }, { effectiveValue: { stringValue: 'b' }, effectiveFormat: bold }] },
      ] }],
    }, 2)
    const a = snapshot.cellData[3][1]
    const b = snapshot.cellData[3][2]
    expect(a.s).toBeDefined()
    expect(a.s).toBe(b.s)
    expect(a.s!.startsWith('s2_')).toBe(true)
    expect(snapshot.styles[a.s!]).toEqual({ bl: 1 })
  })

  it('переносит объединённые ячейки в mergeData', () => {
    const { snapshot } = convertGridSheet({
      properties: { sheetId: 1, title: 'S', index: 0 },
      data: [{ rowData: [{ values: [{ effectiveValue: { stringValue: 'x' } }] }] }],
      merges: [{ startRowIndex: 0, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 3 }],
    }, 0)
    expect(snapshot.mergeData).toEqual([{ startRow: 0, endRow: 1, startColumn: 0, endColumn: 2 }])
  })

  it('пустой лист даёт пустой снапшот без ошибок', () => {
    const { snapshot, report } = convertGridSheet({ properties: { sheetId: 1, title: 'Пусто', index: 0 } }, 0)
    expect(snapshot.cellData).toEqual({})
    expect(report.cellCount).toBe(0)
  })
})

describe('summarizeReports', () => {
  it('агрегирует и ставит статус warnings при заморозках', () => {
    const clean = { sheetTitle: 'a', cellCount: 5, formulaCount: 1, frozenFormulas: [], warnings: [] }
    const frozen = { sheetTitle: 'b', cellCount: 3, formulaCount: 2, frozenFormulas: [{ a1: 'A1', fn: 'QUERY' }], warnings: [] }
    expect(summarizeReports([clean, clean]).status).toBe('clean')
    const agg = summarizeReports([clean, frozen])
    expect(agg).toMatchObject({ totalCells: 8, totalFormulas: 3, totalFrozen: 1, status: 'warnings' })
  })
})
