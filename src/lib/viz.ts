// Палитра — референс-инстанс навыка dataviz (валидирована: adjacent CVD dE 24.2, light).
// Менять hex только после прогона scripts/validate_palette.js из навыка dataviz.
export const VIZ = {
  series1: '#2a78d6',
  series2: '#1baf7a',
  negative: '#e34948',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  muted: '#898781',
  inkSecondary: '#52514e',
  surface: '#fcfcfb',
  goodText: '#006300',
} as const

const nf1 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 })
const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })

export function fmtValue(v: number, format: 'number' | 'money' | 'percent'): string {
  if (format === 'percent') return `${nf1.format(v * 100)}%`
  if (format === 'money') return nf0.format(v)
  return Math.abs(v) >= 100 ? nf0.format(v) : nf1.format(v)
}

export function fmtCompact(v: number): string {
  return new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 }).format(v)
}

export const fmtRub = (v: number): string => `${nf0.format(Math.round(v))} ₽`
export const fmtInt = (v: number): string => nf0.format(Math.round(v))
export const fmtDeltaPct = (v: number): string => `${v >= 0 ? '▲' : '▼'}${nf1.format(Math.abs(v))}%`

// Тёмная тема раздела «Сводка» — dataviz dark surfaces + dark categorical column.
export const VIZ_DARK = {
  page: '#0b0b0c',
  surface: '#141416',
  surfaceRaised: '#1a1a1d',
  hairline: '#2a2a2e',
  inkPrimary: '#f5f5f4',
  inkSecondary: '#c3c2b7',
  inkMuted: '#8a8a86',
  grid: '#26262a',
  axis: '#3a3a3e',
  series1: '#3987e5', // blue
  series2: '#199e70', // aqua/green
  series3: '#c98500', // yellow
  series4: '#9085e9', // violet
  good: '#0ca30c',
  goodSoft: '#123f1f',
  warning: '#fab219',
  warningSoft: '#3a2f0c',
  critical: '#e5484d',
  criticalSoft: '#3a1618',
} as const

/** Цвет статуса по достижению цели (%). */
export function goalStatus(pct: number): 'good' | 'warning' | 'critical' {
  if (pct >= 80) return 'good'
  if (pct >= 50) return 'warning'
  return 'critical'
}

/** Цвет дельты: рост — хорошо (зелёный), падение — плохо (красный), около нуля — нейтрально. */
export function deltaStatus(pct: number | null): 'good' | 'warning' | 'critical' {
  if (pct === null || Math.abs(pct) < 3) return 'warning'
  return pct > 0 ? 'good' : 'critical'
}
