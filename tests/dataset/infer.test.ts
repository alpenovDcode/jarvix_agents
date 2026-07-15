import { describe, it, expect } from 'vitest'
import { inferColumnType, parseNumberLike, parseRuDate, serialToISO } from '@/lib/dataset/infer'

describe('parseNumberLike', () => {
  it('числа и строки-числа', () => {
    expect(parseNumberLike(42)).toBe(42)
    expect(parseNumberLike('1 234,56')).toBe(1234.56)
    expect(parseNumberLike('1,234.56')).toBe(1234.56)
    expect(parseNumberLike('1.234,56')).toBe(1234.56) // европейский формат: точка — тысячи, запятая — десятичная
    expect(parseNumberLike('15%')).toBe(0.15)
    expect(parseNumberLike('1 200 ₸')).toBe(1200)
    expect(parseNumberLike('abc')).toBeNull()
    expect(parseNumberLike(null)).toBeNull()
  })
})

describe('parseRuDate / serialToISO', () => {
  it('русские и ISO даты', () => {
    expect(parseRuDate('01.06.2026')).toBe('2026-06-01')
    expect(parseRuDate('1.6.26')).toBe('2026-06-01')
    expect(parseRuDate('2026-06-01')).toBe('2026-06-01')
    expect(parseRuDate('45.13.2026')).toBeNull()
    expect(parseRuDate('2026-99-99')).toBeNull() // ISO-мусор не должен пройти как дата (ронял bucketKey)
    expect(parseRuDate('привет')).toBeNull()
  })
  it('серийные даты Google (эпоха 1899-12-30)', () => {
    expect(serialToISO(46174)).toBe('2026-06-01')
    expect(serialToISO(46175)).toBe('2026-06-02')
    expect(serialToISO(46174.75)).toBe('2026-06-01') // DATE_TIME 18:00 — тот же день, не завтра
  })
})

describe('inferColumnType', () => {
  const noNf = (n: number) => Array<string | null>(n).fill(null)

  it('date по формату Google', () => {
    expect(inferColumnType([46174, 46175, 46176], { nfTypes: ['DATE', 'DATE', 'DATE'], title: 'Дата' })).toBe('date')
  })
  it('date по строкам дд.мм.гггг', () => {
    expect(inferColumnType(['01.06.2026', '02.06.2026', null], { nfTypes: noNf(3), title: 'Дата' })).toBe('date')
  })
  it('percent по формату и по %-строкам', () => {
    expect(inferColumnType([0.12, 0.34], { nfTypes: ['PERCENT', 'PERCENT'], title: 'CTR' })).toBe('percent')
    expect(inferColumnType(['12%', '34%'], { nfTypes: noNf(2), title: 'CTR' })).toBe('percent')
  })
  it('money по формату CURRENCY и по символам валют', () => {
    expect(inferColumnType([1000, 2000], { nfTypes: ['CURRENCY', 'CURRENCY'], title: 'Расход' })).toBe('money')
    expect(inferColumnType(['1 200 ₸', '3 400 ₸'], { nfTypes: noNf(2), title: 'Расход' })).toBe('money')
  })
  it('number для чисел без формата', () => {
    expect(inferColumnType([1, 2, 3, null], { nfTypes: noNf(4), title: 'Лиды' })).toBe('number')
  })
  it('id по названию колонки', () => {
    expect(inferColumnType([101, 102, 103], { nfTypes: noNf(3), title: 'ID кампании' })).toBe('id')
  })
  it('category при малом числе уникальных', () => {
    expect(inferColumnType(['VK', 'Яндекс', 'VK', 'VK'], { nfTypes: noNf(4), title: 'Канал' })).toBe('category')
  })
  it('text по умолчанию', () => {
    expect(inferColumnType(['Запуск А', 'Тест Б', 'Промо В', 'Акция Г'], { nfTypes: noNf(4), title: 'Комментарий' })).toBe('text')
  })
})
