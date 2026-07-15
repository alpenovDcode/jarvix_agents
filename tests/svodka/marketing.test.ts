import { describe, it, expect } from 'vitest'
import { buildMarketingSvodka } from '@/lib/svodka/marketing'
import type { SheetSnapshot } from '@/lib/types'

// Итог Марафон: два блока-периода (МАЙ АВТО / ИЮНЬ АВТО), метрики в строках A, факт в C.
function itogSnapshot(): SheetSnapshot {
  const cd: SheetSnapshot['cellData'] = {}
  const set = (r: number, label: string, fact?: number) => {
    cd[r] = { 0: { v: label } }
    if (fact !== undefined) cd[r][2] = { v: fact }
  }
  set(0, 'МАЙ АВТО')
  cd[1] = { 0: {}, 2: { v: 'ФАКТ' } }
  set(2, 'Активаций бота', 500)
  set(3, 'Кол-во рег', 250)
  set(4, 'Кол-во чекинов 1', 60)
  set(5, 'Кол-во АП', 20)
  set(6, 'Кол-во оплат', 10)
  set(7, 'Сумма оплат', 100000)
  set(8, 'Romi', 1.5)
  set(9, 'ИЮНЬ АВТО')
  cd[10] = { 0: {}, 2: { v: 'ФАКТ' } }
  set(11, 'Активаций бота', 200)
  set(12, 'Кол-во рег', 100)
  set(13, 'Кол-во оплат', 6)
  set(14, 'Сумма оплат', 60000)
  set(15, 'Romi', 3.0)
  return { name: 'Итог Марафон', rowCount: 20, columnCount: 10, cellData: cd, mergeData: [], styles: {} }
}

describe('buildMarketingSvodka', () => {
  const s = buildMarketingSvodka(itogSnapshot())

  it('KPI за май + дельта июнь к маю', () => {
    const act = s.kpis.find((k) => k.id === 'k-Активаций бота')!
    expect(act.value).toBe(500)
    expect(act.deltaPct).toBe(-60) // (200-500)/500
  })

  it('воронка: этапы с конверсией от активаций', () => {
    expect(s.combo.rows[0]).toEqual({ t: 'Активации', bar: 500, line: 100 })
    expect(s.combo.rows[1]).toEqual({ t: 'Регистрации', bar: 250, line: 50 })
    expect(s.combo.rows[4]).toEqual({ t: 'Оплаты', bar: 10, line: 2 })
  })

  it('было→стало: май против июня', () => {
    const wn = s.wasNow.find((r) => r.id === 'wn-Активаций бота')!
    expect(wn).toMatchObject({ from: 500, to: 200 })
  })

  it('ROMI «меньше лучше»=false — рост зелёный (higherBetter)', () => {
    const romi = s.kpis.find((k) => k.id === 'k-Romi')!
    expect(romi.higherBetter).toBe(true)
    expect(romi.value).toBe(1.5)
  })

  it('целей нет (планы не заданы) — goals пусты', () => {
    expect(s.goals).toEqual([])
  })
})
