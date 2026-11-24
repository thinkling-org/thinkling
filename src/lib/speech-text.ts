// Keep the prose and inline identifiers from rendered Markdown, omitting code blocks.
export function readableSpeechText(root) {
  if (!root) return ''
  const copy = root.cloneNode(true)
  for (const block of copy.querySelectorAll('pre')) block.replaceWith(' ')
  for (const br of copy.querySelectorAll('br')) br.replaceWith(' ')
  for (const block of [...copy.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li')].reverse()) {
    const text = block.textContent.trimEnd()
    if (text && !hasSentenceEnding(text)) block.append('.')
    block.append(' ')
  }
  for (const cell of copy.querySelectorAll('td, th')) cell.append(' ')
  return normalizeSpeechText(copy.textContent)
}

function hasSentenceEnding(text) {
  return /[.!?…]["”»’)\]]*$/u.test(text)
}

export function speechSentence(text) {
  const sentence = text.trim().replace(/[:;]$/u, '')
  return sentence && !hasSentenceEnding(sentence) ? `${sentence}.` : sentence
}

function normalizeSpeechText(text = '') {
  return text
    .replace(/\bm\.in\./giu, 'między innymi')
    .replace(/(?<![\p{L}\p{N}_])TDZ(?![\p{L}\p{N}_])/gu, 'te de zet')
    // Split member access without changing decimals or sentence-ending periods.
    .replace(/(?<=[\p{L}\p{N}_$])(?:\?\.|\.)(?=[\p{L}_$])/gu, ' ')
    .replace(/(?<=[\p{L}\p{N}_$])\(\s*\)/gu, '')
    .replace(/\s+\.(?=\s|$)/gu, '.')
    .replace(/[:;]\.(?=\s|$)/gu, '.')
    .replace(/\s+/gu, ' ')
    .trim()
}

export function speechChunks(sections) {
  return sections.flatMap((section) => {
    const text = normalizeSpeechText(section)
    const sentences = []
    let start = 0
    for (const boundary of text.matchAll(/[.!?…]+["”»’)\]]*(?=\s+\S)/gu)) {
      const end = boundary.index + boundary[0].length
      const sentence = text.slice(start, end).trim()
      if (/(?<!\p{L})(?:np|tj|tzn|tzw|prof|dr|mgr|godz|ul|św|ok|zob|por)\.$/iu.test(sentence)) continue
      sentences.push(sentence)
      start = end
    }
    if (text.slice(start).trim()) sentences.push(text.slice(start).trim())

    return sentences.flatMap((sentence) => {
      const parts = (sentence.match(/[\s\S]{1,450}(?=\s|$)|[\s\S]{1,450}/gu) || [])
        .map((part) => part.trim()).filter(Boolean)
      return parts.map((text, index) => ({ text, pauseAfter: index === parts.length - 1 }))
    })
  })
}
