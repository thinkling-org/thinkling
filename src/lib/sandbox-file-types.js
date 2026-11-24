const LANGUAGES = {
  php: 'php', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', h: 'cpp', c: 'c', py: 'python',
  js: 'javascript', mjs: 'javascript', ts: 'typescript', java: 'java', cs: 'csharp', go: 'go',
  rs: 'rust', rb: 'ruby', md: 'markdown', json: 'json', sh: 'shell', yml: 'yaml', yaml: 'yaml',
  html: 'html', css: 'css', xml: 'xml', toml: 'ini', mod: 'go',
}
const BADGES = {
  php: 'PHP', py: 'PY', js: 'JS', ts: 'TS', cpp: 'C++', hpp: 'C++', c: 'C', go: 'GO',
  rs: 'RS', java: 'JV', cs: 'C#', rb: 'RB', md: 'MD', json: '{}', sh: '$', sql: 'SQL',
}

function extension(path) {
  return path.split('.').pop().toLowerCase()
}

export function fileLanguage(path) {
  return LANGUAGES[extension(path)] || 'plaintext'
}

export function fileBadge(path) {
  return BADGES[extension(path)] || '·'
}
