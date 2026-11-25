// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import CodeTaskBrief from '../../src/components/exercises/CodeTaskBrief.vue'
import { configureLocale } from '../../src/lib/i18n.ts'
import type { Exercise } from '../../src/domain.ts'

enableAutoUnmount(afterEach)
afterEach(() => configureLocale(() => 'en'))

function render(fields: Partial<Exercise> = {}, language = 'python') {
  configureLocale(() => 'en')
  const exercise: Exercise = { id: 'task', type: 'code', stage: 'check', prompt: 'Complete the task.', ...fields }
  return mount(CodeTaskBrief, { props: { exercise, language, fileName: 'main.py' } })
}

describe('task content from lesson data', () => {
  it('does not guess output from code identifiers mentioned in prose', () => {
    const wrapper = render({ requirements: ['Print `total` with `print()`.'] })
    expect(wrapper.find('.out').exists()).toBe(false)
    expect(wrapper.get('.reqs').text()).toBe('Print total with print().')
  })

  it('displays explicit expected output exactly, independently of the requirement language', () => {
    const expectedOutput = '  Łódź\n'
    const wrapper = render({ requirements: ['Affichez le résultat.'], expectedOutput }, 'go')
    expect(wrapper.get('.out').element.textContent).toBe(`›${expectedOutput}`)
  })

  it('keeps prose and inline code in an example as Markdown instead of treating it all as source code', () => {
    const wrapper = render({ example: 'W terminalu: `go run .` → `Hello, Go!`' }, 'go')
    expect(wrapper.find('.ex-md pre').exists()).toBe(false)
    expect(wrapper.get('.ex-md').text()).toBe('W terminalu: go run . → Hello, Go!')
    expect(wrapper.findAll('.ex-md code')).toHaveLength(2)
  })

  it('preserves explicitly fenced code in an example', () => {
    const wrapper = render({ example: 'Run this command:\n\n```bash\ngo run .\n```' }, 'go')
    expect(wrapper.get('.ex-md pre').text()).toBe('go run .')
    expect(wrapper.get('.ex-md').text()).toContain('Run this command:')
  })

  it('does not derive hints from the hidden reference solution', () => {
    const wrapper = render({ solution: 'print(f"{sum(values)}")' })
    expect(wrapper.find('.chips').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('sum()')
  })

  it('shows the tools declared for the exercise, including languages without a built-in glossary', () => {
    const wrapper = render({ toolbox: [{ name: 'println!', description: 'Print the supplied value.' }] }, 'rust')
    expect(wrapper.get('.chips button').text()).toBe('println!')
  })
})
