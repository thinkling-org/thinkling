// Small helpers shared by block normalizers and descriptions.

export const hasText = (value) => typeof value === 'string' && value.trim().length > 0
export const list = (value) => (Array.isArray(value) ? value : [])
export const lineCount = (code) => (hasText(code) ? code.trimEnd().split('\n').length : 0)
export const validLine = (line, count) => Number.isInteger(line) && line > 0 && line <= count
export const pairs = (value) => list(value)
  .filter((pair) => hasText(pair?.name))
  .map(({ name, value: v }) => ({ name: name.trim(), value: v == null ? '' : String(v) }))

/** Numbered lines for tutor descriptions. */
export const numbered = (items, format) => items.map((item, i) => `${i + 1}. ${format(item)}`).join('\n')
export const formatPairs = (items) => items.map(({ name, value }) => `${name}=${value}`).join(', ')
