import { describe, it, expect } from 'vitest'
import { excelColorToHex, numFmtType, parseA1Range, cellValue, excelWidthToPx } from '@/lib/xlsx/convert'

describe('excelColorToHex', () => {
  it('argb с альфой → #rrggbb', () => {
    expect(excelColorToHex({ argb: 'FFD9EAD3' })).toBe('#d9ead3')
  })
  it('полностью прозрачный (alpha 00) → null', () => {
    expect(excelColorToHex({ argb: '00FFFFFF' })).toBeNull()
  })
  it('theme 1 (чёрный текст) → #000000', () => {
    expect(excelColorToHex({ theme: 1 })).toBe('#000000')
  })
  it('theme с положительным tint светлее базового', () => {
    expect(excelColorToHex({ theme: 1, tint: 0.5 })).toBe('#808080')
  })
  it('нет цвета → null', () => {
    expect(excelColorToHex(undefined)).toBeNull()
  })
})

describe('numFmtType', () => {
  it('процент', () => expect(numFmtType('0.00%')).toBe('PERCENT'))
  it('дата', () => expect(numFmtType('dd.mm.yyyy')).toBe('DATE'))
  it('валюта рубли', () => expect(numFmtType('#,##0.00 ₽')).toBe('CURRENCY'))
  it('General → undefined', () => expect(numFmtType('General')).toBeUndefined())
  it('обычное число → undefined', () => expect(numFmtType('#,##0')).toBeUndefined())
})

describe('parseA1Range', () => {
  it('одна строка', () => {
    expect(parseA1Range('A1:C1')).toEqual({ startColumn: 0, startRow: 0, endColumn: 2, endRow: 0 })
  })
  it('многобуквенные колонки', () => {
    expect(parseA1Range('Z2:AB4')).toEqual({ startColumn: 25, startRow: 1, endColumn: 27, endRow: 3 })
  })
  it('мусор → null', () => expect(parseA1Range('нет')).toBeNull())
})

describe('excelWidthToPx', () => {
  it('дефолтная ширина ~12.63 символа → ~93px', () => {
    expect(excelWidthToPx(12.63)).toBe(93)
  })
  it('широкая колонка 27.75 → ~199px', () => {
    expect(excelWidthToPx(27.75)).toBe(199)
  })
})

describe('cellValue', () => {
  it('число/строка/булево', () => {
    expect(cellValue(42)).toBe(42)
    expect(cellValue('текст')).toBe('текст')
    expect(cellValue(true)).toBe(true)
  })
  it('дата → ISO yyyy-mm-dd', () => {
    expect(cellValue(new Date('2026-06-01T00:00:00Z'))).toBe('2026-06-01')
  })
  it('формула → её результат', () => {
    expect(cellValue({ formula: 'SUM(A1:A2)', result: 241126.93 } as never)).toBe(241126.93)
  })
  it('richText → склеенный текст', () => {
    expect(cellValue({ richText: [{ text: 'Hello ' }, { text: 'world' }] } as never)).toBe('Hello world')
  })
  it('пусто → undefined', () => {
    expect(cellValue(null)).toBeUndefined()
  })
})
