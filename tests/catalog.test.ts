import { describe, it, expect } from 'vitest'
import { groupTables, type CatalogTable } from '@/lib/catalog'

const t = (title: string, folder: string): CatalogTable => ({
  id: title, title, folder, import_status: 'ok', last_imported_at: null, sheet_count: 1,
})

describe('groupTables', () => {
  it('группирует по папкам и сортирует по-русски', () => {
    const groups = groupTables([t('Бюджет', 'Реклама'), t('Анонсы', 'Контент'), t('Отчёт', 'Реклама')], '')
    expect(groups.map((g) => g.folder)).toEqual(['Контент', 'Реклама'])
    expect(groups[1].tables.map((x) => x.title)).toEqual(['Бюджет', 'Отчёт'])
  })
  it('ищет по названию и папке без учёта регистра', () => {
    const groups = groupTables([t('Бюджет 2026', 'Реклама'), t('Анонсы', 'Контент')], 'бюдж')
    expect(groups).toHaveLength(1)
    expect(groups[0].tables[0].title).toBe('Бюджет 2026')
  })
  it('пустой запрос возвращает всё', () => {
    expect(groupTables([t('А', 'Ф1'), t('Б', 'Ф2')], '  ')).toHaveLength(2)
  })
})
