import { t } from './i18n.ts'
import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'

self.MonacoEnvironment = {
  getWorker(_id, label) {
    if (label === 'typescript' || label === 'javascript') return new TsWorker()
    if (label === 'json') return new JsonWorker()
    return new EditorWorker()
  },
}

let themed = false
export function ensureTheme() {
  if (themed) return
  themed = true
  monaco.editor.defineTheme('thinkling', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', foreground: 'D5DADE' },
      { token: 'comment', foreground: '7F8A93', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'C4A7FF' },
      { token: 'string', foreground: 'C3E88D' },
      { token: 'string.escape', foreground: '89DDFF' },
      { token: 'number', foreground: 'F78C6C' },
      { token: 'regexp', foreground: '89DDFF' },
      { token: 'type', foreground: 'FFCB6B' },
      { token: 'type.identifier', foreground: 'FFCB6B' },
      { token: 'identifier', foreground: 'D5DADE' },
      { token: 'delimiter', foreground: 'A6B0B8' },
      { token: 'operator', foreground: '89DDFF' },
    ],
    colors: {
      'editor.background': '#0F1214',
      'editor.foreground': '#D5DADE',
      'editorLineNumber.foreground': '#4F585F',
      'editorLineNumber.activeForeground': '#B7BEC4',
      'editor.lineHighlightBackground': '#161A1E',
      'editor.lineHighlightBorder': '#00000000',
      'editor.selectionBackground': '#3A3260',
      'editor.inactiveSelectionBackground': '#2A2445',
      'editorCursor.foreground': '#B4A3FF',
      'editorIndentGuide.background1': '#1F2428',
      'editorIndentGuide.activeBackground1': '#2C3237',
      'editorWidget.background': '#1C2024',
      'editorWidget.border': '#2C3237',
      'editorSuggestWidget.background': '#1C2024',
      'editorSuggestWidget.border': '#2C3237',
      'editorSuggestWidget.selectedBackground': '#261F45',
      'editorHoverWidget.background': '#1C2024',
      'editorHoverWidget.border': '#2C3237',
      'scrollbarSlider.background': '#2C323780',
      'scrollbarSlider.hoverBackground': '#3A4147',
      'editorGutter.background': '#0F1214',
      'editorOverviewRuler.border': '#0F1214',
    },
  })
  const ts = monaco.languages.typescript
  const opts = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    allowNonTsExtensions: true,
    strict: false,
    noEmitOnError: false,
    lib: ['es2022', 'webworker'],
  }
  ts.typescriptDefaults.setCompilerOptions(opts)
  ts.javascriptDefaults.setCompilerOptions({ ...opts, checkJs: false, allowJs: true })
  // Suppress unused-variable and missing-module diagnostics in exercises.
  ts.typescriptDefaults.setDiagnosticsOptions({ diagnosticCodesToIgnore: [6133, 6196, 2307, 1375, 1378] })
  ts.javascriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true })
}

const LANG_MAP = {
  javascript: 'javascript', js: 'javascript', typescript: 'typescript', ts: 'typescript', python: 'python', py: 'python',
  go: 'go', golang: 'go', rust: 'rust', java: 'java', csharp: 'csharp', 'c#': 'csharp', cpp: 'cpp', 'c++': 'cpp', c: 'c',
  php: 'php', ruby: 'ruby', kotlin: 'kotlin', swift: 'swift', sql: 'sql', bash: 'shell', shell: 'shell', html: 'html', css: 'css',
}
export function monacoLanguage(lang: string) {
  return LANG_MAP[String(lang || '').toLowerCase()] || 'plaintext'
}

/** Transpiluje TS → JS przez worker TypeScriptu z Monaco. */
export async function transpileTypeScript(code: string) {
  ensureTheme()
  const uri = monaco.Uri.parse(`file:///__transpile_${Date.now()}.ts`)
  const model = monaco.editor.createModel(code, 'typescript', uri)
  try {
    const getWorker = await monaco.languages.typescript.getTypeScriptWorker()
    const client = await getWorker(uri)
    const out = await client.getEmitOutput(uri.toString())
    const file = out.outputFiles.find((f) => f.name.endsWith('.js'))
    if (!file) throw new Error(t('no compiler output'))
    return file.text
  } finally {
    model.dispose()
  }
}

export { monaco }
