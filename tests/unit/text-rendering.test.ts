// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { firstSentence, highlight, highlightLines, normalizeLang, renderMarkdown } from '../../src/lib/markdown.ts'
import { markCodeTokens } from '../../src/lib/code-tokens.ts'
import { activeTerm, closeCodeDefinitionSoon, glossaryEntry, keepCodeDefinitionOpen, linkCodeTerms, linkGlossaryTerms } from '../../src/lib/glossary.ts'

afterEach(() => { activeTerm.value = null; keepCodeDefinitionOpen(); vi.useRealTimers(); document.body.replaceChildren() })
const dom = (html: string) => { const el = document.createElement('div'); el.innerHTML = html; return el }

describe('Markdown rendering', () => {
  it('renders prose, inline formatting and highlighted code', () => {
    expect(renderMarkdown('# Heading\n\n**Bold** and [link](https://example.com)')).toContain('<h1>Heading</h1>')
    expect(renderMarkdown('**Bold**', { inline: true })).toBe('<strong>Bold</strong>')
    const code = dom(renderMarkdown('```js\nconst x = 1\n```'))
    expect(code.querySelector('pre code')!.textContent).toBe('const x = 1')
    expect(code.querySelector('.hljs-keyword')).not.toBeNull()
    expect(renderMarkdown(null)).toBe('')
  })

  it('removes executable HTML, event handlers and javascript URLs', () => {
    const html = dom(renderMarkdown('<script>alert(1)</script><img src=x onerror="alert(1)"><a href="javascript:alert(1)">link</a>'))
    expect(html.querySelector('script')).toBeNull()
    expect(html.querySelector('[onerror]')).toBeNull()
    expect(html.querySelector('a')!.hasAttribute('href')).toBe(false)
  })

  it('escapes unknown code languages and preserves multiline syntax spans', () => {
    expect(highlight('<img src="x"> & \'value\'', 'unknown')).toBe('&lt;img src=&quot;x&quot;&gt; &amp; &#39;value&#39;')
    const lines = highlightLines('/* first\nsecond */\nconst x = 1;\n', 'js')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toContain('hljs-comment')
    expect(lines[1]).toContain('hljs-comment')
    expect(lines.map((line) => dom(line).textContent)).toEqual(['/* first', 'second */', 'const x = 1;'])
    expect(highlightLines(null, '')).toEqual([''])
  })

  it.each([[' TS ', 'typescript'], ['py', 'python'], ['c#', 'csharp'], ['c++', 'cpp'], ['golang', 'go'], ['shell', 'bash'], [undefined, '']])('normalizes %s', (input, expected) => {
    expect(normalizeLang(input)).toBe(expected)
  })

  it('extracts the first prose sentence, removes code and truncates at a word boundary', () => {
    expect(firstSentence('```js\nignored()\n```\nThis sentence explains the result. Another sentence.')).toBe('This sentence explains the result.')
    expect(firstSentence('One two three four five six seven', 20)).toBe('One two three four…')
    expect(firstSentence(null)).toBe('')
  })
})

describe('clickable definitions in code and prose', () => {
  it('marks whole tokens, keeps original indices and gives longer matches precedence', () => {
    const html = dom(markCodeTokens('<span class="hljs">foo foobar $foo foo.bar + &lt;tag&gt;</span>', ['foo', 'foo.bar', '+'], 1))
    expect([...html.querySelectorAll('button')].map((button) => [button.textContent, button.dataset.token])).toEqual([['foo', '0'], ['foo.bar', '1'], ['+', '2']])
    expect(html.querySelector('button.active')!.getAttribute('aria-pressed')).toBe('true')
    expect(html.querySelector('.hljs')!.textContent).toBe('foo foobar $foo foo.bar + <tag>')
    expect(markCodeTokens('unchanged', [])).toBe('unchanged')
  })

  it('links glossary words without changing links, buttons, code programs or editable content', () => {
    const html = dom(linkGlossaryTerms('<p>Closure and event loop, not closureValue.</p><a>closure</a><button>TDZ</button><pre>hoisting</pre><code>closure</code><code>const closure = 1</code><div contenteditable>TDZ</div>'))
    expect([...html.querySelectorAll<HTMLButtonElement>('button.glossary-term')].map((button) => button.dataset.glossaryTerm)).toEqual(['closure', 'event loop', 'closure'])
    expect(html.querySelector('a button')).toBeNull()
    expect(html.querySelector('pre button')).toBeNull()
    expect(glossaryEntry('closure')!.definition).toContain('retains access')
    expect(glossaryEntry('unknown')).toBeUndefined()
  })

  it('only links supported built-in function calls and avoids object methods', () => {
    const call = '<span class="hljs-built_in">print</span>'
    const html = dom(linkCodeTerms(`${call}(x); obj.${call}(x); ${call};`, 'python'))
    expect(html.querySelectorAll('button')).toHaveLength(1)
    expect(html.querySelector('button')!.dataset.glossaryTerm).toBe('python:print')
    expect(glossaryEntry('python:print')!.title).toBe('print()')
    const js = '<span class="hljs-variable language_">console</span>.<span class="hljs-title function_">log</span>(1)'
    expect(linkCodeTerms(js, 'typescript')).toContain('data-glossary-term="javascript:console.log"')
    expect(linkCodeTerms(call, 'go')).toBe(call)
    expect(linkCodeTerms('<span class="hljs-built_in">unknown</span>()', 'python')).not.toContain('<button')
  })

  it('closes a definition after the hover delay but keeps it open while focused or explicitly retained', () => {
    vi.useFakeTimers()
    const term = document.createElement('button')
    document.body.append(term)
    activeTerm.value = term
    closeCodeDefinitionSoon(term)
    vi.advanceTimersByTime(199)
    expect(activeTerm.value).toBe(term)
    vi.advanceTimersByTime(1)
    expect(activeTerm.value).toBeNull()
    activeTerm.value = term
    term.focus()
    closeCodeDefinitionSoon(term)
    vi.advanceTimersByTime(200)
    expect(activeTerm.value).toBe(term)
    term.blur()
    closeCodeDefinitionSoon(term)
    keepCodeDefinitionOpen()
    vi.advanceTimersByTime(500)
    expect(activeTerm.value).toBe(term)
  })
})
