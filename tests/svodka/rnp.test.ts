import { describe, it, expect } from 'vitest'
import { buildRnpSvodka, type RnpMonth } from '@/lib/svodka/rnp'
import type { SheetSnapshot } from '@/lib/types'

// строит снапшот из строк [метка, план, факт] — метки намеренно в разном порядке по месяцам
function snap(rows: [string, number, number][]): SheetSnapshot {
  const cellData: SheetSnapshot['cellData'] = { 0: { 0: { v: 'метрика' }, 1: { v: 'План' }, 2: { v: 'Факт' } } }
  rows.forEach(([label, plan, fact], i) => {
    cellData[i + 1] = { 0: { v: label }, 1: { v: plan }, 2: { v: fact } }
  })
  return { name: 't', rowCount: rows.length + 5, columnCount: 10, cellData, mergeData: [], styles: {} }
}

const months: RnpMonth[] = [
  { label: 'окт', snapshot: snap([['Бюджет', 1000, 900], ['Регистраций', 500, 400], ['Цена лида', 5, 6]]) },
  // январь: другой порядок строк + другое имя регистраций — матчинг по startsWith
  { label: 'янв', snapshot: snap([['Регистраций (авто)', 800, 600], ['Трафик', 300, 250], ['Бюджет', 2000, 1500], ['Цена лида', 5, 4]]) },
]

describe('buildRnpSvodka', () => {
  const s = buildRnpSvodka(months)

  it('метрики матчатся по названию несмотря на разный порядок строк', () => {
    const reg = s.kpis.find((k) => k.id === 'k-Регистраций')!
    expect(reg.value).toBe(600) // факт последнего полного месяца (янв)
  })

  it('дельта считается к предыдущему месяцу', () => {
    const reg = s.kpis.find((k) => k.id === 'k-Регистраций')!
    expect(reg.deltaPct).toBe(50) // (600-400)/400
  })

  it('динамика регистраций по месяцам', () => {
    const area = s.areas.find((a) => a.id === 'a-reg')!
    expect(area.points).toEqual([{ t: 'окт', v: 400 }, { t: 'янв', v: 600 }])
  })

  it('цель = план по метрике «больше лучше»', () => {
    const g = s.goals.find((x) => x.id === 'g-Регистраций')!
    expect(g).toMatchObject({ value: 600, target: 800 })
  })

  it('combo связывает бюджет и регистрации помесячно', () => {
    expect(s.combo.rows).toEqual([
      { t: 'окт', bar: 900, line: 400 },
      { t: 'янв', bar: 1500, line: 600 },
    ])
  })

  it('было→стало: первый месяц против последнего', () => {
    const wn = s.wasNow.find((r) => r.id === 'wn-Регистраций')!
    expect(wn).toMatchObject({ from: 400, to: 600 })
  })
})
