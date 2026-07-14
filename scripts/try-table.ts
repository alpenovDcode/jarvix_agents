/**
 * Песочница: прогоняет одну таблицу через ядро TableHub (распознавание структуры,
 * типизация колонок, автоаналитика) БЕЗ Supabase и Google-ключей.
 *
 * Использование:
 *   npm run try -- ./путь/к/таблице.csv
 *   npm run try -- "https://docs.google.com/spreadsheets/d/<ID>/edit"   (таблица должна быть открыта по ссылке)
 *
 * Как получить CSV из своей Google-таблицы:
 *   вариант 1 (приватная): Файл → Скачать → CSV, затем указать путь к файлу
 *   вариант 2 (по ссылке): Настройки доступа → «Все, у кого есть ссылка», затем вставить URL таблицы
 */
import { readFile } from 'node:fs/promises'
import { buildDataset } from '@/lib/dataset/build'
import { buildWidgets, type OkDataset } from '@/lib/analytics/widgets'
import { fmtValue } from '@/lib/viz'
import { matrixToSnapshot, parseCsv } from '@/lib/csv'

/** Полный URL Google-таблицы → ссылка CSV-экспорта первого листа. */
function toCsvUrl(url: string): string {
  const m = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(url)
  if (!m) return url
  const gid = /[#&?]gid=(\d+)/.exec(url)?.[1] ?? '0'
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`
}

async function loadText(source: string): Promise<string> {
  if (/^https?:\/\//.test(source)) {
    const url = source.includes('/spreadsheets/') ? toCsvUrl(source) : source
    const res = await fetch(url, { redirect: 'follow' })
    if (!res.ok) {
      throw new Error(
        `не удалось скачать (HTTP ${res.status}). Таблица приватная? ` +
        `Открой доступ по ссылке или скачай как CSV и укажи путь к файлу.`,
      )
    }
    const text = await res.text()
    if (text.trimStart().startsWith('<')) {
      throw new Error('Google вернул HTML вместо CSV — таблица не открыта по ссылке. Открой доступ или скачай CSV.')
    }
    return text
  }
  return readFile(source, 'utf8')
}

const TYPE_RU: Record<string, string> = {
  number: 'число', money: 'деньги', percent: 'процент', date: 'дата', category: 'категория', id: 'идентификатор', text: 'текст',
}

function printDataset(d: OkDataset) {
  console.log(`\n🔍 Структура распознана (уверенность ${Math.round(d.confidence * 100)}%)`)
  console.log(`   Заголовки в строке ${d.headerRow + 1}, данных строк: ${d.rows.length}`)
  console.log(`   Колонки:`)
  for (const c of d.columns) console.log(`   • ${c.title} — ${TYPE_RU[c.type] ?? c.type}`)
}

function printWidgets(d: OkDataset) {
  const { widgets, truncated } = buildWidgets(d)
  console.log(`\n📊 Аналитика — ${widgets.length} виджет(ов)${truncated ? ` (+${truncated} скрыто)` : ''}:`)
  for (const w of widgets) {
    if (w.kind === 'rowcount') console.log(`   [счётчик] ${w.title}: ${w.count}`)
    else if (w.kind === 'kpi')
      console.log(`   [KPI] ${w.title}: сумма ${fmtValue(w.stats.sum, w.format)}, сред. ${fmtValue(w.stats.avg, w.format)}, мин ${fmtValue(w.stats.min, w.format)}, макс ${fmtValue(w.stats.max, w.format)}`)
    else if (w.kind === 'timeseries') {
      const growth = w.growthPct === null ? '—' : `${w.growthPct > 0 ? '+' : ''}${w.growthPct}%`
      const preview = w.points.slice(0, 3).map((p) => `${p.t}=${fmtValue(p.v, w.format)}`).join(', ')
      console.log(`   [динамика/${w.granularity}] ${w.title}: ${preview}${w.points.length > 3 ? '…' : ''} · рост ${growth}`)
    } else if (w.kind === 'breakdown')
      console.log(`   [структура] ${w.title}: ${w.items.map((i) => `${i.name} ${i.sharePct}%`).join(', ')}`)
    else if (w.kind === 'slice')
      console.log(`   [срез] ${w.title}: ${w.items.map((i) => `${i.name} ${fmtValue(i.value, w.format)}`).join(', ')}`)
  }
}

async function main() {
  const source = process.argv[2]
  if (!source) {
    console.error('Укажи CSV-файл или ссылку на Google-таблицу:\n  npm run try -- ./table.csv\n  npm run try -- "https://docs.google.com/spreadsheets/d/.../edit"')
    process.exit(1)
  }
  const matrix = parseCsv(await loadText(source))
  console.log(`\n📄 Загружено: ${matrix.length} строк, ${Math.max(0, ...matrix.map((r) => r.length))} колонок`)

  const snapshot = matrixToSnapshot(matrix)
  const d = buildDataset(snapshot)
  if (d.status === 'empty') { console.log('\n⚠️  Таблица пустая.'); return }
  if (d.status === 'needs_mapping') {
    console.log(`\n⚠️  Не удалось автоматически распознать структуру (уверенность ${Math.round(d.confidence * 100)}%).`)
    console.log('   В приложении такой лист помечается «требует разметки» — админ укажет заголовки вручную (фаза 3).')
    return
  }
  printDataset(d)
  printWidgets(d)
  console.log('\n✅ Это ровно то, что платформа покажет во вкладках «Аналитика» и «Таблица». Всё посчитано локально, без облака.\n')
}

main().catch((e) => { console.error(`\n❌ ${e instanceof Error ? e.message : e}\n`); process.exit(1) })
