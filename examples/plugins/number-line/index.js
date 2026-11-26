// Example Thinkling block plugin: plain ES module, no build step, no framework.
// Everything the block needs from the app comes through `ctx`.

const finite = Number.isFinite
const hasText = (value) => typeof value === 'string' && value.trim().length > 0
const list = (value) => (Array.isArray(value) ? value : [])

function normalize(data) {
  const { instruction, min, max } = data ?? {}
  if (!hasText(instruction) || !finite(min) || !finite(max) || min >= max) return null
  const inRange = (value) => finite(value) && value >= min && value <= max
  const points = list(data.points)
    .filter((point) => inRange(point?.value) && hasText(point.label))
    .map(({ value, label }) => ({ value, label: label.trim() }))
    .sort((a, b) => a.value - b.value)
    .slice(0, 8)
  if (points.length < 2) return null
  return {
    instruction,
    min,
    max,
    step: finite(data.step) && data.step > 0 ? data.step : (max - min) / 100,
    start: inRange(data.start) ? data.start : min,
    points,
    notes: list(data.notes).filter((note) => inRange(note?.from) && hasText(note.say)).sort((a, b) => a.from - b.from),
  }
}

function describe(data) {
  const marks = data.points.map((point) => `${point.label} = ${point.value}`).join(', ')
  return `Number line from ${data.min} to ${data.max}. Marked values: ${marks}.\n${data.instruction}`
}

const SVG = 'http://www.w3.org/2000/svg'
const svg = (name, attributes) => {
  const node = document.createElementNS(SVG, name)
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value))
  return node
}

function mount(el, props, ctx) {
  let data = props.data
  let value = data.start
  // ctx.render* return a dispose function; rendering again into the same element replaces it.
  const disposers = new Map()

  const root = document.createElement('section')
  root.className = 'number-line'
  root.style.cssText = 'display:grid;gap:12px;padding:16px;border:1px solid var(--border, #3333);border-radius:12px'
  root.setAttribute('aria-label', ctx.t('Number line'))

  const instruction = document.createElement('div')
  const picture = svg('svg', { viewBox: '0 0 600 70', width: '100%', role: 'img' })
  const slider = document.createElement('input')
  slider.type = 'range'
  slider.setAttribute('aria-label', ctx.t('Marker position'))
  const readout = document.createElement('p')
  readout.style.margin = '0'
  readout.setAttribute('aria-live', 'polite')
  const note = document.createElement('div')
  root.append(instruction, picture, slider, readout, note)
  el.append(root)

  const x = (v) => 20 + ((v - data.min) / (data.max - data.min)) * 560

  function drawScale() {
    picture.replaceChildren(svg('line', { x1: 20, y1: 35, x2: 580, y2: 35, stroke: 'currentColor', 'stroke-width': 2 }))
    for (const point of data.points) {
      picture.append(svg('line', { x1: x(point.value), y1: 27, x2: x(point.value), y2: 43, stroke: 'currentColor', 'stroke-width': 2 }))
      const label = svg('text', { x: x(point.value), y: 62, 'text-anchor': 'middle', 'font-size': 13, fill: 'currentColor' })
      label.textContent = point.label
      picture.append(label)
    }
    picture.append(svg('circle', { class: 'marker', cx: x(value), cy: 35, r: 8, fill: 'var(--yellow, #f5b301)' }))
    slider.min = String(data.min)
    slider.max = String(data.max)
    slider.step = String(data.step)
    slider.value = String(value)
    disposers.set(instruction, ctx.renderMarkdown(instruction, data.instruction))
  }

  function drawValue() {
    picture.querySelector('.marker')?.setAttribute('cx', String(x(value)))
    const passed = data.points.filter((point) => point.value <= value).map((point) => point.label)
    readout.textContent = `${ctx.t('Marker: {0}', [ctx.formatNumber(value)])} · ${ctx.t('Passed: {0}', [passed.join(', ') || ctx.t('none yet')])}`
    const reached = data.notes.filter((item) => value >= item.from).at(-1)
    note.hidden = !reached
    if (reached) disposers.set(note, ctx.renderMarkdown(note, reached.say))
  }

  slider.addEventListener('input', () => {
    value = Number(slider.value)
    drawValue()
    ctx.emit('change', value)
  })

  drawScale()
  drawValue()

  return {
    update(next) {
      if (next.data === data) return
      data = next.data
      value = data.start
      drawScale()
      drawValue()
    },
    unmount() {
      for (const dispose of disposers.values()) dispose()
      el.replaceChildren()
    },
  }
}

export default { normalize, describe, mount }
