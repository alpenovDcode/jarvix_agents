import { describe, it, expect } from 'vitest'
import { detectDataRange, snapshotToMatrix, CONFIDENCE_THRESHOLD } from '@/lib/dataset/detect'
import type { CellScalar, SheetSnapshot } from '@/lib/types'

const M = (rows: CellScalar[][]) => rows

describe('snapshotToMatrix', () => {
  it('разворачивает разреженный cellData в матрицу', () => {
    const snapshot: SheetSnapshot = {
      name: 'S', rowCount: 100, columnCount: 26, mergeData: [], styles: {},
      cellData: { 0: { 0: { v: 'Дата' }, 2: { v: 'Лиды' } }, 2: { 1: { v: 5 } } },
    }
    expect(snapshotToMatrix(snapshot)).toEqual([
      ['Дата', null, 'Лиды'],
      [null, null, null],
      [null, 5, null],
    ])
  })
  it('пустой снапшот → пустая матрица', () => {
    expect(snapshotToMatrix({ name: 'S', rowCount: 100, columnCount: 26, mergeData: [], styles: {}, cellData: {} })).toEqual([])
  })
})

describe('detectDataRange', () => {
  it('чистый список: заголовки в строке 0', () => {
    const r = detectDataRange(M([
      ['Дата', 'Канал', 'Расход'],
      ['01.06.2026', 'VK', 1000],
      ['02.06.2026', 'Яндекс', 2000],
      ['03.06.2026', 'VK', 1500],
    ]))!
    expect(r).toMatchObject({ headerRow: 0, startCol: 0, endCol: 2, endRow: 3 })
    expect(r.confidence).toBeGreaterThan(CONFIDENCE_THRESHOLD)
  })

  it('шапка-название сверху: заголовки найдены ниже', () => {
    const r = detectDataRange(M([
      ['Отчёт по рекламе', null, null],
      [null, null, null],
      ['Дата', 'Канал', 'Расход'],
      ['01.06.2026', 'VK', 1000],
      ['02.06.2026', 'Яндекс', 2000],
    ]))!
    expect(r.headerRow).toBe(2)
    expect(r.endRow).toBe(4)
  })

  it('игнорирует хвост после трёх пустых строк', () => {
    const r = detectDataRange(M([
      ['Имя', 'Значение'],
      ['a', 1],
      ['b', 2],
      [null, null],
      [null, null],
      [null, null],
      ['примечание внизу', null],
    ]))!
    expect(r.endRow).toBe(2)
  })

  it('строка из чисел не считается заголовком', () => {
    expect(detectDataRange(M([
      [1, 2, 3],
      [4, 5, 6],
    ]))).toBeNull()
  })

  it('пустая матрица → null', () => {
    expect(detectDataRange([])).toBeNull()
  })
})
