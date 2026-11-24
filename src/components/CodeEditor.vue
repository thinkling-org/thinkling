<script setup>
import { t } from '../lib/i18n.js'
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { monaco, ensureTheme, monacoLanguage } from '../lib/monaco.js'
import { renderMarkdown } from '../lib/markdown.js'

const props = defineProps({
  modelValue: { type: String, default: '' },
  language: { type: String, default: 'javascript' },
  fileName: { type: String, default: 'main.js' },
  uid: { type: String, default: () => Math.random().toString(36).slice(2) },
  issues: { type: Array, default: () => [] }, // [{line, severity, message, replacement}]
  readOnly: Boolean,
  providerName: { type: String, default: 'Claude' },
  keepModel: Boolean, // Retain undo history when switching files.
})
const emit = defineEmits(['update:modelValue', 'cursor', 'apply', 'dismiss', 'submit', 'save'])

const el = ref(null)
const editor = shallowRef(null)
let model = null
let decorations = null
let zones = [] // { zoneId, widget }
let silent = false

onMounted(() => {
  ensureTheme()
  const lang = monacoLanguage(props.language)
  const uri = monaco.Uri.parse(`file:///codenoms/${props.uid}/${props.fileName || 'main'}`)
  const existing = monaco.editor.getModel(uri)
  if (existing && props.keepModel) {
    model = existing
    if (model.getValue() !== props.modelValue) model.setValue(props.modelValue)
  } else {
    existing?.dispose()
    model = monaco.editor.createModel(props.modelValue, lang, uri)
  }
  editor.value = monaco.editor.create(el.value, {
    model,
    theme: 'codenoms',
    fontFamily: "'JetBrains Mono Variable', 'JetBrains Mono', Consolas, monospace",
    fontSize: 15,
    lineHeight: 27,
    fontLigatures: true,
    minimap: { enabled: false },
    automaticLayout: true,
    scrollBeyondLastLine: false,
    padding: { top: 14, bottom: 14 },
    tabSize: 2,
    renderLineHighlight: 'line',
    lineNumbersMinChars: 3,
    glyphMargin: false,
    folding: false,
    smoothScrolling: true,
    cursorBlinking: 'smooth',
    cursorSmoothCaretAnimation: 'on',
    fixedOverflowWidgets: true,
    readOnly: props.readOnly,
    scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
    overviewRulerBorder: false,
    stickyScroll: { enabled: false },
  })
  decorations = editor.value.createDecorationsCollection()
  editor.value.onDidChangeModelContent(() => {
    if (!silent) emit('update:modelValue', editor.value.getValue())
  })
  editor.value.onDidChangeCursorPosition((e) => emit('cursor', { line: e.position.lineNumber, col: e.position.column }))
  editor.value.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => emit('submit'))
  editor.value.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => emit('save'))
  editor.value.onDidLayoutChange(() => renderIssues())
  renderIssues()
  editor.value.focus()
})

onBeforeUnmount(() => {
  clearZones()
  editor.value?.dispose()
  if (!props.keepModel) model?.dispose()
})

watch(
  () => props.modelValue,
  (v) => {
    if (!editor.value || v === editor.value.getValue()) return
    silent = true
    editor.value.executeEdits('external', [{ range: model.getFullModelRange(), text: v }])
    editor.value.pushUndoStop()
    silent = false
  },
)
watch(() => props.readOnly, (r) => editor.value?.updateOptions({ readOnly: r }))
watch(() => props.issues, () => renderIssues(), { deep: true })

const COLORS = { error: '#FF5A6E', warning: '#FFC93C', info: '#7CB8FF' }

function clearZones() {
  if (!editor.value) return
  editor.value.changeViewZones((acc) => zones.forEach((z) => acc.removeZone(z.zoneId)))
  zones.forEach((z) => editor.value.removeOverlayWidget(z.widget))
  zones = []
}

function buildNode(issue, idx) {
  const node = document.createElement('div')
  node.className = `dl-zone ${issue.severity || 'error'}`
  const text = document.createElement('div')
  text.className = 'dl-zone-text md'
  text.innerHTML = `<b>${props.providerName}:</b> ${renderMarkdown(issue.message, { inline: true })}`
  node.appendChild(text)
  const actions = document.createElement('div')
  actions.className = 'dl-zone-actions'
  if (issue.replacement && !props.readOnly) {
    const apply = document.createElement('button')
    apply.className = 'dl-zone-apply'
    apply.textContent = t('Apply: {0}', [issue.replacement.trim().slice(0, 60)])
    apply.onclick = () => applyFix(issue, idx)
    actions.appendChild(apply)
  }
  const dismiss = document.createElement('button')
  dismiss.className = 'dl-zone-dismiss'
  dismiss.textContent = issue.replacement ? t('I\'ll fix it myself') : 'OK'
  dismiss.onclick = () => emit('dismiss', idx)
  actions.appendChild(dismiss)
  node.appendChild(actions)
  return node
}

function renderIssues() {
  if (!editor.value || !decorations) return
  clearZones()
  const max = model.getLineCount()
  const list = (props.issues || []).map((i, idx) => ({ ...i, idx, line: Math.min(Math.max(1, i.line | 0), max) }))
  decorations.set(
    list.map((i) => ({
      range: new monaco.Range(i.line, 1, i.line, model.getLineMaxColumn(i.line)),
      options: {
        isWholeLine: true,
        className: `dl-issue-line ${i.severity || 'error'}`,
        linesDecorationsClassName: `dl-issue-bar ${i.severity || 'error'}`,
        inlineClassName: i.severity === 'error' ? 'dl-issue-squiggle' : undefined,
        overviewRuler: { color: COLORS[i.severity] || COLORS.error, position: monaco.editor.OverviewRulerLane.Right },
        hoverMessage: { value: i.message },
      },
    })),
  )
  const layout = editor.value.getLayoutInfo()
  const width = Math.max(220, Math.min(620, layout.contentWidth - layout.verticalScrollbarWidth - 40))
  const left = layout.contentLeft + 16
  editor.value.changeViewZones((acc) => {
    for (const i of list) {
      const node = buildNode(i, i.idx)
      node.style.width = `${width}px`
      node.style.position = 'absolute'
      node.style.visibility = 'hidden'
      el.value.appendChild(node)
      const h = node.offsetHeight + 12
      el.value.removeChild(node)
      node.style.visibility = ''
      node.style.left = `${left}px`
      const widget = {
        getId: () => `dl-zone-${props.uid}-${i.idx}`,
        getDomNode: () => node,
        getPosition: () => null,
      }
      editor.value.addOverlayWidget(widget)
      const spacer = document.createElement('div')
      const zoneId = acc.addZone({
        afterLineNumber: i.line,
        heightInPx: h,
        domNode: spacer,
        onDomNodeTop: (top) => {
          node.style.top = `${top + 4}px`
        },
      })
      zones.push({ zoneId, widget })
    }
  })
}

function applyFix(issue, idx) {
  const line = Math.min(Math.max(1, issue.line | 0), model.getLineCount())
  editor.value.executeEdits('claude-fix', [
    { range: new monaco.Range(line, 1, line, model.getLineMaxColumn(line)), text: issue.replacement.replace(/\n$/, '') },
  ])
  editor.value.pushUndoStop()
  emit('apply', idx)
}

</script>

<template>
  <div ref="el" class="ce" />
</template>

<style scoped>
.ce {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 260px;
}
</style>

<style>
.dl-issue-line.error {
  background: #2b1a1f;
}
.dl-issue-line.warning {
  background: #2a2416;
}
.dl-issue-line.info {
  background: #17222f;
}
.dl-issue-bar {
  margin-left: 3px;
  width: 3px !important;
}
.dl-issue-bar.error {
  background: #ff5a6e;
}
.dl-issue-bar.warning {
  background: #ffc93c;
}
.dl-issue-bar.info {
  background: #7cb8ff;
}
.dl-issue-squiggle {
  text-decoration: underline wavy #ff5a6e;
  text-underline-offset: 5px;
  text-decoration-skip-ink: none;
}
.dl-zone {
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #1c2024;
  border: 2px solid #5a2a34;
  border-radius: 12px;
  padding: 10px 14px;
  font-family: 'Nunito Variable', 'Nunito', sans-serif;
  box-sizing: border-box;
}
.dl-zone.warning {
  border-color: #5a4a22;
}
.dl-zone.info {
  border-color: #23406a;
}
.dl-zone-text {
  font-size: 15px;
  font-weight: 700;
  line-height: 1.5;
  color: #e4e8eb;
  white-space: normal;
}
.dl-zone-text code {
  color: #c4b5ff;
}
.dl-zone-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.dl-zone-actions button {
  border-radius: 10px;
  padding: 5px 12px;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}
.dl-zone-apply {
  background: #261f45;
  color: #d3c9ff;
  border: 2px solid #7c5cff;
  font-family: 'JetBrains Mono Variable', 'JetBrains Mono', monospace;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dl-zone-dismiss {
  background: transparent;
  color: #b7bec4;
  border: 2px solid #2c3237;
  font-family: inherit;
}
</style>
