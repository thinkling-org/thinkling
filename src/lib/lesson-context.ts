import { describeVisualization, readInteraction, readLessonVisualization } from '../blocks/registry.ts'
import type { Exercise, ExerciseResult, TestRun, WorkspaceFile } from '../domain.ts'

export function buildLessonChatContext({ exercise, answer, result, title, moduleTitle, experience, files, testRun }: {
  exercise: Exercise
  /** Text, a choice index, or for interactive exercises whatever the block reported. */
  answer: unknown
  result?: ExerciseResult | null
  title?: string
  moduleTitle?: string
  experience?: string
  files?: WorkspaceFile[]
  testRun?: TestRun | null
}) {
  const parts = [`Lesson: ${title} (${moduleTitle})`, `Exercise type: ${exercise.type}`]
  parts.push(`Learning stage: ${exercise.stage === 'practice' ? 'guided practice, not graded; help the learner make one small attempt at a time' : exercise.stage}`)
  if (experience) parts.push(`Learner background and goal: ${experience}`)
  if (exercise.type === 'learn') {
    parts.push(`Knowledge card: ${exercise.title}\n${exercise.prompt}${exercise.code ? `\n\nExample:\n\`\`\`\n${exercise.code}\n\`\`\`` : ''}\n\nExplanation: ${exercise.explanation}`)
    const visualization = describeVisualization(readLessonVisualization(exercise))
    if (visualization) parts.push(visualization)
  } else if (exercise.type === 'code') {
    parts.push(`Exercise: ${exercise.title}\n${exercise.prompt}\nRequirements: ${(exercise.requirements || []).join('; ')}`)
    if (exercise.expectedOutput) parts.push(`Expected output:\n\`\`\`\n${exercise.expectedOutput}\n\`\`\``)
    if (exercise.runtime === 'docker') {
      parts.push(files?.length
        ? `Current learner workspace files:\n${files.map((file) => `### ${file.path}\n\`\`\`\n${file.content}\n\`\`\``).join('\n\n')}`
        : 'Current workspace files are unavailable. Do not assume the learner code is empty.')
      parts.push(`Test command: ${exercise.testCommand || '(not specified)'}`)
    } else {
      parts.push(`Learner code:\n\`\`\`\n${answer ?? ''}\n\`\`\``)
    }
    if (testRun) {
      const results = testRun.results.map((item) => `${item.ok ? 'PASS' : 'FAIL'} ${item.name}${item.error ? `: ${item.error}` : ''}`).join('\n')
      parts.push(`Latest test run (the learner may have edited the code since this run):\n${testRun.compileError || results || '(no test results)'}${testRun.timedOut ? '\nExecution timed out.' : ''}${testRun.output ? `\nOutput:\n${testRun.output.slice(-10_000)}` : ''}`)
    } else parts.push('No test run is available in this session. Do not invent test failures.')
    if (result?.data?.summary) parts.push(`Review: ${result.data.summary}`)
  } else {
    parts.push(`Question: ${exercise.prompt}`)
    if (exercise.code) parts.push(`Code:\n\`\`\`\n${exercise.code}\n\`\`\``)
    if (exercise.type === 'choice') {
      parts.push(`Options: ${exercise.options.map((o, i) => `${i + 1}) ${o}`).join(' | ')}`)
      parts.push(`Correct choice: ${exercise.correctIndex + 1}. Learner choice: ${typeof answer === 'number' ? answer + 1 : 'none'}`)
      parts.push(`Explanation: ${exercise.explanation}`)
    } else if (exercise.type === 'interactive') {
      const task = describeVisualization(readInteraction(exercise))
      if (task) parts.push(`Interactive task (the app grades it):\n${task}`)
      parts.push(`Learner answer so far: ${answer === null || answer === undefined ? '(not complete)' : JSON.stringify(answer)}`)
      if (result?.status) parts.push(`Result: ${result.status}${result.data?.feedback ? ` — ${result.data.feedback}` : ''}`)
      parts.push(`Explanation: ${exercise.explanation}`)
    } else {
      parts.push(`Learner answer: ${answer || '(none)'}`)
      parts.push(`Reference answer: ${exercise.referenceAnswer}`)
      if (result?.data) parts.push(`Grade: ${result.data.score}/10`)
    }
  }
  return parts.join('\n\n')
}
