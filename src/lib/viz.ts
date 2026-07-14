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
