import { describeVisualization, readLessonVisualization } from './lesson-visualizations.ts'
import type { Exercise, ExerciseResult } from '../domain.ts'

export function buildLessonChatContext({ exercise, answer, result, title, moduleTitle, experience }: {
  exercise: Exercise
  answer: string | number | null
  result?: ExerciseResult | null
  title?: string
  moduleTitle?: string
  experience?: string
}) {
  const parts = [`Lesson: ${title} (${moduleTitle})`, `Exercise type: ${exercise.type}`]
  if (experience) parts.push(`Learner background and goal: ${experience}`)
  if (exercise.type === 'learn') {
    parts.push(`Knowledge card: ${exercise.title}\n${exercise.prompt}${exercise.code ? `\n\nExample:\n\`\`\`\n${exercise.code}\n\`\`\`` : ''}\n\nExplanation: ${exercise.explanation}`)
    const visualization = describeVisualization(readLessonVisualization(exercise))
    if (visualization) parts.push(visualization)
  } else if (exercise.type === 'code') {
    parts.push(`Exercise: ${exercise.title}\n${exercise.prompt}\nRequirements: ${(exercise.requirements || []).join('; ')}`)
    parts.push(`Learner code:\n\`\`\`\n${answer}\n\`\`\``)
    if (result?.data?.summary) parts.push(`Review: ${result.data.summary}`)
  } else {
    parts.push(`Question: ${exercise.prompt}`)
    if (exercise.code) parts.push(`Code:\n\`\`\`\n${exercise.code}\n\`\`\``)
    if (exercise.type === 'choice') {
      parts.push(`Options: ${exercise.options.map((o, i) => `${i + 1}) ${o}`).join(' | ')}`)
      parts.push(`Correct choice: ${exercise.correctIndex + 1}. Learner choice: ${typeof answer === 'number' ? answer + 1 : 'none'}`)
      parts.push(`Explanation: ${exercise.explanation}`)
    } else {
      parts.push(`Learner answer: ${answer || '(none)'}`)
      parts.push(`Reference answer: ${exercise.referenceAnswer}`)
      if (result?.data) parts.push(`Grade: ${result.data.score}/10`)
    }
  }
  return parts.join('\n\n')
}
