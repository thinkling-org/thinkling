import { Marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/common'

const marked = new Marked({ gfm: true, breaks: false })

marked.use({
  renderer: {
    code({ text, lang }) {
      return `<pre><code class="hljs">${highlight(text, lang)}</code></pre>`
    },
  },
})

export function highlight(code, lang) {
  const l = normalizeLang(lang)
  try {
    if (l && hljs.getLanguage(l)) return hljs.highlight(code, { language: l, ignoreIllegals: true }).value
  } catch {}
  return escapeHtml(code)
}

/** Highlight code and split the HTML into lines, carrying open spans across line boundaries. */
export function highlightLines(code, lang) {
  const html = highlight(String(code ?? '').replace(/\s+$/, ''), lang)
  const out = []
  const open = []
  for (const raw of html.split('\n')) {
    const prefix = open.join('')
    for (const t of raw.match(/<span[^>]*>|<\/span>/g) || []) t === '</span>' ? open.pop() : open.push(t)
    out.push(prefix + raw + '</span>'.repeat(open.length))
  }
  return out
}

/** Extract the first sentence of Markdown prose for a short message. */
export function firstSentence(md, max = 170) {
  const t = String(md || '').replace(/```[\s\S]*?```/g, '').replace(/\s+/g, ' ').trim()
  const m = t.match(/^.{15,}?[.!?](?=\s|$)/)
  const s = m ? m[0] : t
  return s.length > max ? s.slice(0, max - 1).replace(/\s\S*$/, '') + '…' : s
}

export function normalizeLang(lang) {
  const l = String(lang || '').toLowerCase().trim()
  const map = { js: 'javascript', ts: 'typescript', py: 'python', 'c#': 'csharp', cs: 'csharp', 'c++': 'cpp', golang: 'go', sh: 'bash', shell: 'bash' }
  return map[l] || l
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

export function renderMarkdown(src, { inline = false } = {}) {
  const html = inline ? marked.parseInline(String(src ?? ''), { async: false }) : marked.parse(String(src ?? ''), { async: false })
  return DOMPurify.sanitize(html)
}
