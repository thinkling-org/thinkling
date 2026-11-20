const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const word = /[\p{L}\p{N}_$]/u

/**
 * Owija wystąpienia tokenów w podświetlonym HTML jednej linii kodu przyciskami,
 * żeby uczeń mógł najechać na fragment i zobaczyć jego definicję.
 */
export function markCodeTokens(html, tokens, activeIndex = -1) {
  if (!tokens?.length) return html
  const order = tokens.map((token, index) => ({ token, index })).sort((a, b) => b.token.length - a.token.length)
  const source = order.map(({ token }) => {
    const before = word.test(token[0]) ? '(?<![\\p{L}\\p{N}_$])' : ''
    const after = word.test(token.at(-1)) ? '(?![\\p{L}\\p{N}_$])' : ''
    return `${before}${escape(token)}${after}`
  }).join('|')
  const pattern = new RegExp(source, 'gu')
  const indexOf = new Map(order.map(({ token, index }) => [token, index]))

  const template = document.createElement('template')
  template.innerHTML = html
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT)
  const nodes = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node)
  for (const node of nodes) {
    let end = 0
    const fragment = document.createDocumentFragment()
    for (const match of node.data.matchAll(pattern)) {
      const index = indexOf.get(match[0])
      fragment.append(node.data.slice(end, match.index))
      const button = document.createElement('button')
      button.type = 'button'
      button.className = index === activeIndex ? 'def-term active' : 'def-term'
      button.dataset.token = String(index)
      button.setAttribute('aria-pressed', String(index === activeIndex))
      button.textContent = match[0]
      fragment.append(button)
      end = match.index + match[0].length
    }
    if (end) {
      fragment.append(node.data.slice(end))
      node.replaceWith(fragment)
    }
  }
  return template.innerHTML
}
