// Close open structures when parsing partial JSON from the model stream.

function closers(s: string): { inStr: boolean; esc: boolean; tail: string } {
  const stack: string[] = []
  let inStr = false
  let esc = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === '{') stack.push('}')
    else if (c === '[') stack.push(']')
    else if (c === '}' || c === ']') stack.pop()
  }
  return { inStr, esc, tail: stack.reverse().join('') }
}

export function parsePartialJson<T = unknown>(input: string): T | null {
  if (!input) return null
  try {
    return JSON.parse(input)
  } catch {}
  let s = input
  for (let attempt = 0; attempt < 8 && s.length; attempt++) {
    let t = s
    const c = closers(t)
    if (c.inStr) t = (c.esc ? t.slice(0, -1) : t) + '"'
    t = t.replace(/[\s,:]+$/, '')
    try {
      return JSON.parse(t + closers(t).tail)
    } catch {}
    // A trailing string can be an array value. Discard it as a key only if closing the JSON failed.
    const withoutKey = t.replace(/([{,])\s*"[^"]*"$/, '$1').replace(/,$/, '')
    if (withoutKey !== t) {
      try {
        return JSON.parse(withoutKey + closers(withoutKey).tail)
      } catch {}
    }
    const cut = Math.max(s.lastIndexOf(','), s.lastIndexOf('{'), s.lastIndexOf('['))
    if (cut <= 0) break
    s = s.slice(0, s[cut] === ',' ? cut : cut + 1)
  }
  return null
}
