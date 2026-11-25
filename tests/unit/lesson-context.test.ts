import { describe, expect, it } from 'vitest'
import { buildLessonChatContext } from '../../src/lib/lesson-context.ts'
import type { Exercise } from '../../src/domain.ts'

const exercise: Exercise = {
  id: 'go-code', type: 'code', stage: 'check', codeLanguage: 'go', runtime: 'docker',
  title: 'Run a Go program', prompt: 'Print a greeting',
  requirements: ['Use module example.com/hello', 'Print Hello, Go!'],
  testCommand: 'go run tests/check.go',
}

describe('lesson tutor context', () => {
  it('includes the actual Docker workspace instead of the unused single-file answer', () => {
    const context = buildLessonChatContext({ exercise, answer: '', files: [
      { path: 'main.go', content: 'package main\nfunc main() {}' },
      { path: 'go.mod', content: 'module example.com/todo\n\ngo 1.23' },
    ] })
    expect(context).toContain('### main.go\n```\npackage main\nfunc main() {}')
    expect(context).toContain('### go.mod\n```\nmodule example.com/todo')
    expect(context).toContain('Use module example.com/hello')
    expect(context).not.toContain('Learner code:\n```\n\n```')
  })

  it('includes failed tests and compiler output and distinguishes them from the current source', () => {
    const context = buildLessonChatContext({ exercise, answer: '', files: [{ path: 'main.go', content: 'package main' }], testRun: {
      results: [{ name: 'module', ok: false, error: 'expected example.com/hello, got example.com/todo' }],
      output: 'main.go:5:1: syntax error',
    } })
    expect(context).toContain('FAIL module: expected example.com/hello, got example.com/todo')
    expect(context).toContain('main.go:5:1: syntax error')
    expect(context).toContain('Test command: go run tests/check.go')
    expect(context).toContain('may have edited the code since this run')
  })

  it('marks missing Docker context as unavailable rather than presenting it as empty code', () => {
    const context = buildLessonChatContext({ exercise, answer: '' })
    expect(context).toContain('Current workspace files are unavailable')
    expect(context).toContain('Do not assume the learner code is empty')
    expect(context).toContain('No test run is available')
  })

  it('keeps the current code for browser exercises and includes execution failures', () => {
    const context = buildLessonChatContext({
      exercise: { ...exercise, runtime: 'browser', codeLanguage: 'javascript' }, answer: 'console.log("Hello")',
      testRun: { results: [], compileError: 'Unexpected token', timedOut: true },
    })
    expect(context).toContain('console.log("Hello")')
    expect(context).toContain('Unexpected token')
    expect(context).toContain('Execution timed out')
  })

  it('passes explicit output metadata to the tutor without extracting it from requirements', () => {
    const context = buildLessonChatContext({ exercise: { ...exercise, expectedOutput: '  Result\n' }, answer: '' })
    expect(context).toContain('Expected output:\n```\n  Result\n\n```')
  })
})
