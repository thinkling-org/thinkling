// Example Thinkling block plugin: plain ES module, no build step, no framework.
// Everything the block needs from the app comes through `ctx`.
// Two modes: a visualization on a learn card, and (API 1.1) an exercise the block grades.

const finite = Number.isFinite
const hasText = (value) => typeof value === 'string' && value.trim().length > 0
const list = (value) => (Array.isArray(value) ? value : [])
// Floating-point slack, so 0.1 + 0.2 counts as 0.3.
const EPSILON = 1e-9

function normalize(data, stored) {
  const exercise = stored?.mode === 'exercise'
  const { instruction, min, max } = data ?? {}
  if ((!exercise && !hasText(instruction)) || !finite(min) || !finite(max) || min >= max) return null
  const inRange = (value) => finite(value) && value >= min && value <= max
  if (exercise && !inRange(data.target)) return null
  const points = list(data.points)
    .filter((point) => inRange(point?.value) && hasText(point.label))
    // In an exercise a reference mark on the target would give the answer away.
    .filter((point) => !exercise || Math.abs(point.value - data.target) > EPSILON)
    .map(({ value, label }) => ({ value, label: label.trim() }))
    .sort((a, b) => a.value - b.value)
    .slice(0, 8)
  if (points.length < (exercise ? 1 : 2)) return null
  const step = finite(data.step) && data.step > 0 ? data.step : (max - min) / 100
  const normalized = {
    instruction: hasText(instruction) ? instruction : '',
    min,
    max,
    step,
    start: inRange(data.start) ? data.start : min,
    points,
    notes: list(data.notes).filter((note) => inRange(note?.from) && hasText(note.say)).sort((a, b) => a.from - b.from),
  }
  if (!exercise) return normalized
  return { ...normalized, target: data.target, tolerance: finite(data.tolerance) && data.tolerance > 0 ? data.tolerance : 0 }
}

function describe(data) {
  const marks = data.points.map((point) => `${point.label} = ${point.value}`).join(', ')
  const task = data.target === undefined ? '' : `\nTask: mark ${data.target} (accepted within ±${data.tolerance}).`
  return `Number line from ${data.min} to ${data.max}. Marked values: ${marks}.${data.instruction ? `\n${data.instruction}` : ''}${task}`
}

/** Exercise mode: the answer is the number the learner marked. */
function grade(data, answer, ctx) {
  if (!finite(answer)) return { verdict: 'wrong', score: 0, feedback: ctx.t('Move the marker to your answer first.') }
  const distance = Math.abs(answer - data.target)
  if (distance <= data.tolerance + EPSILON) return { verdict: 'correct', score: 1 }
  // One slider step away (or twice the tolerance) counts as nearly right.
  const near = Math.max(data.step, data.tolerance * 2) + EPSILON
  return distance <= near
    ? { verdict: 'almost', score: 0.5, feedback: ctx.t('Close. You marked {0}.', [ctx.formatNumber(answer)]) }
    : { verdict: 'wrong', score: 0, feedback: ctx.t('You marked {0}.', [ctx.formatNumber(answer)]) }
}

const SVG = 'http://www.w3.org/2000/svg'
const svg = (name, attributes) => {
  const node = document.createElementNS(SVG, name)
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value))
  return node
}
const COLORS = { correct: 'var(--green, #3fb950)', almost: 'var(--yellow, #f5b301)', wrong: 'var(--red, #f85149)' }

function mount(el, props, ctx) {
  let current = props
  let data = props.data
  const exercise = () => current.mode === 'exercise'
  // In an exercise the marker counts as an answer only after the learner moves it (or comes back to it).
  let value = exercise() && finite(props.answer) ? props.answer : data.start
  let moved = exercise() && finite(props.answer)
  // ctx.render* return a dispose function; rendering again into the same element replaces it.
  const disposers = new Map()

  const root = document.createElement('section')
  root.className = 'number-line'
  root.style.cssText = 'display:grid;gap:12px;padding:16px;border:1px solid var(--border, #3333);border-radius:12px'
  root.setAttribute('aria-label', ctx.t('Number line'))

  const instruction = document.createElement('div')
  const picture = svg('svg', { viewBox: '0 0 600 80', width: '100%', role: 'img' })
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

  function draw() {
    const result = exercise() ? current.result : null
    picture.replaceChildren(svg('line', { x1: 20, y1: 35, x2: 580, y2: 35, stroke: 'currentColor', 'stroke-width': 2 }))
    for (const point of data.points) {
      picture.append(svg('line', { x1: x(point.value), y1: 27, x2: x(point.value), y2: 43, stroke: 'currentColor', 'stroke-width': 2 }))
      const label = svg('text', { x: x(point.value), y: 62, 'text-anchor': 'middle', 'font-size': 13, fill: 'currentColor' })
      label.textContent = point.label
      picture.append(label)
    }
    // After grading, show where the answer was; hidden again when a practice attempt is retried.
    if (result && result.verdict !== 'correct') {
      picture.append(svg('circle', { class: 'target', cx: x(data.target), cy: 35, r: 7, fill: 'none', stroke: COLORS.correct, 'stroke-width': 3 }))
      const label = svg('text', { x: x(data.target), y: 16, 'text-anchor': 'middle', 'font-size': 12, fill: COLORS.correct })
      label.textContent = ctx.formatNumber(data.target)
      picture.append(label)
    }
    picture.append(svg('circle', { class: 'marker', cx: x(value), cy: 35, r: 8, fill: result ? COLORS[result.verdict] : 'var(--yellow, #f5b301)' }))
    slider.min = String(data.min)
    slider.max = String(data.max)
    slider.step = String(data.step)
    slider.value = String(value)
    slider.disabled = !!result
    instruction.hidden = !data.instruction
    if (data.instruction) disposers.set(instruction, ctx.renderMarkdown(instruction, data.instruction))
    drawValue()
  }

  function drawValue() {
    picture.querySelector('.marker')?.setAttribute('cx', String(x(value)))
    const marker = ctx.t('Marker: {0}', [ctx.formatNumber(value)])
    if (exercise()) {
      readout.textContent = marker
      note.hidden = true
      return
    }
    const passed = data.points.filter((point) => point.value <= value).map((point) => point.label)
    readout.textContent = `${marker} · ${ctx.t('Passed: {0}', [passed.join(', ') || ctx.t('none yet')])}`
    const reached = data.notes.filter((item) => value >= item.from).at(-1)
    note.hidden = !reached
    if (reached) disposers.set(note, ctx.renderMarkdown(note, reached.say))
  }

  slider.addEventListener('input', () => {
    value = Number(slider.value)
    drawValue()
    if (exercise()) {
      moved = true
      ctx.answer(value)
    } else ctx.emit('change', value)
  })

  draw()
  if (exercise()) ctx.answer(moved ? value : null, { complete: moved })

  return {
    update(next) {
      const dataChanged = next.data !== data
      current = next
      if (dataChanged) {
        data = next.data
        value = data.start
        moved = false
        if (exercise()) ctx.answer(null, { complete: false })
      }
      draw()
    },
    unmount() {
      for (const dispose of disposers.values()) dispose()
      el.replaceChildren()
    },
  }
}

export default { normalize, describe, mount, grade }
