import { t } from './i18n.ts'
import { buildRegressionModel } from './linear-regression.ts'
import { compileLogic } from './logic-expression.ts'
import { checkScenario } from './system-sim.ts'

// Cache validation results because validation evaluates every combination of controls.
const checkedScenarios = new WeakMap()

const hasText = (value) => typeof value === 'string' && value.trim().length > 0
const list = (value) => (Array.isArray(value) ? value : [])
const lineCount = (code) => (hasText(code) ? code.trimEnd().split('\n').length : 0)
const validLine = (line, count) => Number.isInteger(line) && line > 0 && line <= count
const pairs = (value) => list(value)
  .filter((pair) => hasText(pair?.name))
  .map(({ name, value: v }) => ({ name: name.trim(), value: v == null ? '' : String(v) }))

export function readComparisonSteps(variant) {
  if (!variant) return []
  const count = lineCount(variant.code)
  const validSteps = (steps) => Array.isArray(steps)
    ? steps.filter((step) => validLine(step?.line, count) && hasText(step.say))
    : []
  const steps = validSteps(variant.steps)
  return steps.length ? steps : validSteps(variant.trace?.steps)
}

const readers = {
  'code-comparison'(visualization) {
    const { variants } = visualization
    return Array.isArray(variants) && variants.length === 2
      && variants.every((variant) => [variant?.label, variant?.code, variant?.outcome].every(hasText))
      ? visualization
      : null
  },

  'linear-regression'(visualization) {
    const { instruction, xLabel, yLabel, points } = visualization
    if (![instruction, xLabel, yLabel].every(hasText)) return null
    const model = buildRegressionModel(points)
    return model ? { ...visualization, model } : null
  },

  'code-definitions'({ instruction, code, terms }) {
    if (!hasText(code)) return null
    const seen = new Set()
    const valid = list(terms).filter((term) => {
      if (![term?.token, term?.title, term?.definition].every(hasText)) return false
      const token = term.token.trim()
      if (seen.has(token) || !code.includes(token)) return false
      seen.add(token)
      return true
    }).map((term) => ({ ...term, token: term.token.trim(), kind: term.kind || '', example: term.example || '' }))
    return valid.length ? { type: 'code-definitions', instruction: instruction || '', code, terms: valid.slice(0, 8) } : null
  },

  'step-trace'({ instruction, code, steps }) {
    const count = lineCount(code)
    if (!count) return null
    const valid = list(steps)
      .filter((step) => validLine(step?.line, count) && hasText(step.say))
      .map((step) => ({ line: step.line, say: step.say, variables: pairs(step.variables), output: step.output || '' }))
    return valid.length >= 2 ? { type: 'step-trace', instruction: instruction || '', code, steps: valid } : null
  },

  'state-inspector'({ instruction, code, label, layout, steps }) {
    const count = lineCount(code)
    const valid = list(steps)
      .filter((step) => hasText(step?.say))
      .map((step) => ({
        line: validLine(step.line, count) ? step.line : null,
        say: step.say,
        items: list(step.items).filter((item) => hasText(item?.label)).map((item) => ({
          label: item.label, status: item.status || '', details: pairs(item.details),
        })),
      }))
    if (valid.length < 2 || !valid.some((step) => step.items.length)) return null
    return {
      type: 'state-inspector',
      instruction: instruction || '',
      code: count ? code : '',
      label: hasText(label) ? label : t('State'),
      layout: ['stack', 'queue', 'list'].includes(layout) ? layout : 'list',
      steps: valid,
    }
  },

  'value-chart'({ instruction, xLabel, yLabel, xs, series, yMax, notes }) {
    if (![instruction, xLabel, yLabel].every(hasText)) return null
    const xValues = list(xs)
    if (xValues.length < 2 || !xValues.every(Number.isFinite)) return null
    if (xValues.some((x, i) => i && x <= xValues[i - 1])) return null
    const valid = list(series).filter((s) => hasText(s?.label)
      && Array.isArray(s.values) && s.values.length === xValues.length && s.values.every(Number.isFinite))
    if (!valid.length) return null
    return {
      type: 'value-chart', instruction, xLabel, yLabel, xs: xValues,
      series: valid.slice(0, 6).map(({ label, values }) => ({ label, values })),
      yMax: Number.isFinite(yMax) && yMax > 0 ? yMax : null,
      notes: list(notes).filter((note) => Number.isFinite(note?.from) && hasText(note.say))
        .sort((a, b) => a.from - b.from),
    }
  },

  'logic-circuit'({ instruction, inputs, outputs, notes }) {
    if (!hasText(instruction)) return null
    const ids = new Set()
    const validInputs = list(inputs).filter((input) => {
      const id = input?.id?.trim()
      if (!/^[A-Za-z_]\w{0,11}$/.test(id ?? '') || ids.has(id) || /^(AND|OR|XOR|NOT|I|LUB|NIE)$/.test(id)) return false
      ids.add(id)
      return true
    }).slice(0, 4).map((input) => ({ id: input.id.trim(), label: input.label || input.id, on: !!input.on }))
    if (!validInputs.length) return null
    const names = validInputs.map((input) => input.id)
    const validOutputs = list(outputs)
      .filter((output) => hasText(output?.label) && hasText(output.expression))
      .map((output) => ({ label: output.label, expression: output.expression, evaluate: compileLogic(output.expression, names) }))
      .filter((output) => output.evaluate)
      .slice(0, 5)
    if (!validOutputs.length) return null
    return {
      type: 'logic-circuit', instruction, inputs: validInputs, outputs: validOutputs,
      notes: list(notes).filter((note) => new RegExp(`^[01]{${names.length}}$`).test(note?.pattern ?? '') && hasText(note.say)),
    }
  },

  'step-ordering'({ instruction, steps, success, hint }) {
    if (!hasText(instruction)) return null
    const texts = new Set()
    const valid = list(steps).filter((step) => {
      if (!hasText(step?.text) || texts.has(step.text.trim())) return false
      texts.add(step.text.trim())
      return true
    }).map((step) => ({ text: step.text.trim(), indent: Math.max(0, Math.min(3, Number.isInteger(step.indent) ? step.indent : 0)) }))
    return valid.length >= 3 && valid.length <= 8
      ? { type: 'step-ordering', instruction, steps: valid, success: success || '', hint: hint || '' }
      : null
  },

  diagnosis({ instruction, symptom, checks, options }) {
    if (![instruction, symptom].every(hasText)) return null
    const validChecks = list(checks)
      .filter((check) => [check?.name, check?.action, check?.result].every(hasText))
      .map((check) => ({ name: check.name, detail: check.detail || '', action: check.action, result: check.result, ok: !!check.ok }))
      .slice(0, 6)
    const validOptions = list(options)
      .filter((option) => [option?.text, option?.why].every(hasText))
      .map((option) => ({ text: option.text, why: option.why, correct: !!option.correct }))
      .slice(0, 5)
    if (validChecks.length < 2 || validOptions.length < 2 || validOptions.filter((o) => o.correct).length !== 1) return null
    return { type: 'diagnosis', instruction, symptom, checks: validChecks, options: validOptions }
  },

  'system-sim'(visualization) {
    if (!checkedScenarios.has(visualization)) {
      const { scenario, error } = checkScenario(visualization)
      if (error) console.warn(`[system-sim] odrzucony scenariusz: ${error}`)
      checkedScenarios.set(visualization, scenario ?? null)
    }
    return checkedScenarios.get(visualization)
  },
}

export function readLessonVisualization(exercise) {
  if (exercise?.type !== 'learn') return null
  const visualization = exercise.visualization ?? { type: 'code-comparison', variants: exercise.comparison }
  return readers[visualization?.type]?.(visualization) ?? null
}

/** Describe the visualization for tutor chat. */
export function describeVisualization(visualization) {
  if (!visualization) return ''
  const steps = (items, format) => items.map((step, i) => `${i + 1}. ${format(step)}`).join('\n')
  const vars = (variables) => variables.map(({ name, value }) => `${name}=${value}`).join(', ')
  switch (visualization.type) {
    case 'code-comparison':
      return visualization.variants.map((variant) => `${variant.label}\n${variant.code}\n${variant.outcome}`).join('\n\n')
    case 'linear-regression': {
      const points = visualization.model.data.map(({ x, y }) => [x, y])
      return `Linear regression example. X axis: ${visualization.xLabel}. Y axis: ${visualization.yLabel}.\n${visualization.instruction}\n[x, y] pairs: ${JSON.stringify(points)}`
    }
    case 'code-definitions':
      return `Definitions in code:\n${visualization.code}\n${visualization.terms.map((t) => `- ${t.token}: ${t.definition}`).join('\n')}`
    case 'step-trace':
      return `Step-by-step trace:\n${visualization.code}\n${steps(visualization.steps, (s) => `line ${s.line}: ${s.say}${s.variables.length ? ` (${vars(s.variables)})` : ''}`)}`
    case 'state-inspector':
      return `State inspector (${visualization.label}):\n${visualization.code}\n${steps(visualization.steps, (s) => `${s.say} [${s.items.map((item) => item.label).join(', ')}]`)}`
    case 'value-chart':
      return `Chart of ${visualization.yLabel} versus ${visualization.xLabel}. x: ${visualization.xs.join(', ')}\n${visualization.series.map((s) => `${s.label}: ${s.values.join(', ')}`).join('\n')}`
    case 'logic-circuit':
      return `Logic circuit. Inputs: ${visualization.inputs.map((i) => i.id).join(', ')}.\n${visualization.outputs.map((o) => `${o.label} = ${o.expression}`).join('\n')}`
    case 'step-ordering':
      return `Step ordering (correct order):\n${steps(visualization.steps, (s) => s.text)}`
    case 'diagnosis':
      return `Diagnosis: ${visualization.symptom}\nChecks:\n${visualization.checks.map((c) => `- ${c.name} (${c.action}): ${c.result}`).join('\n')}\nOptions: ${visualization.options.map((o) => `${o.text}${o.correct ? ' (correct)' : ''}`).join(' | ')}`
    case 'system-sim': {
      const { sources, nodes, path, failures, controls, goals, solutions } = visualization
      const option = (control, k) => control.options[k].label
      return [
        `System simulation: ${visualization.instruction}`,
        `Traffic: ${sources.map((s) => `${s.label} ${s.rate}/s${s.burstEvery ? ` + ${s.burstSize}/s every ${s.burstEvery} s` : ''}`).join('; ')}`,
        `Path: ${path.map((id) => nodes.find((n) => n.id === id).label).join(' → ')}`,
        failures.length ? `Outages: ${failures.map((f) => `${f.label} (${f.from}–${f.to} s)`).join('; ')}` : '',
        `Controls:\n${controls.map((c) => `- ${c.label}: ${c.options.map((o) => o.label).join(' | ')}`).join('\n')}`,
        `Goals:\n${goals.map((g) => `- ${g.label}`).join('\n')}`,
        `Configurations that meet the goals (guide the learner without revealing them):\n${solutions.map((picks) => `- ${controls.map((c, i) => option(c, picks[i])).join(', ')}`).join('\n')}`,
      ].filter(Boolean).join('\n')
    }
    default:
      return ''
  }
}
