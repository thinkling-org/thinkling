import type { Exercise, LessonContent, PersistedState, PlanDescription } from '../../../src/domain.ts'

export const plan: PlanDescription = {
  title: 'JavaScript foundations', summary: 'Build confidence with functions.', goal: 'Write and explain small functions.',
  level: 'Junior', levelSummary: 'Practise return values.', language: 'javascript', durationWeeks: 1, weakSpots: ['Return values'],
  modules: [{ title: 'Functions', week: 1, description: 'Understand function results.', lessons: [
    { title: 'Returning values', kind: 'mixed', focus: 'Return twice the input.', blocks: [] },
    { title: 'Function assessment', kind: 'test', focus: 'Check understanding.', blocks: [] },
  ] }],
}

export const codeExercise: Exercise = {
  id: 'code', type: 'code', stage: 'check', title: 'Double the number', prompt: 'Implement double(value).',
  codeLanguage: 'javascript', fileName: 'double.js', starterCode: 'function double(value) { return value; }',
  solution: 'function double(value) { return value * 2; }',
  tests: "test('doubles positive numbers', () => expect(double(3)).toBe(6));\ntest('doubles zero', () => expect(double(0)).toBe(0));",
  requirements: ['Return twice the input.'], hints: ['Multiply by two.'], explanation: 'Return the multiplied value.',
  syntax: [{ title: 'Returning', code: 'return value * 2;', explanation: 'Compute and return.' }],
}

const practice = { hints: ['Follow the return expression.'], explanation: 'The caller receives the returned value.' }
export const lesson: LessonContent = {
  intro: { outcome: 'Return values from functions.', relevance: 'Transform input into output.', focus: 'The return expression.' },
  exercises: [
    { id: 'learn', type: 'learn', stage: 'learn', prompt: 'A function returns a value.', code: 'function double(value) { return value * 2; }', codeLanguage: 'javascript' },
    { id: 'predict', type: 'choice', stage: 'practice', prompt: 'What does double(3) return?', options: ['6', '3'], correctIndex: 0, ...practice },
    { ...codeExercise, id: 'practice-code', stage: 'practice' },
    { ...codeExercise, id: 'practice-code-two', stage: 'practice', title: 'Repeat the technique' },
    { id: 'explain', type: 'open', stage: 'practice', prompt: 'Explain what return does.', referenceAnswer: 'It sends a result to the caller.', ...practice },
    { ...codeExercise, id: 'apply' },
    { id: 'recall', type: 'open', stage: 'check', prompt: 'Explain the result in your own words.', referenceAnswer: 'The function returns twice its input.' },
  ],
  flashcards: [{ front: 'What does return do?', back: 'It sends a result to the caller.' }],
}

export const assessment: LessonContent = {
  intro: lesson.intro,
  exercises: [
    { id: 'choice', type: 'choice', stage: 'check', prompt: 'What is two times three?', options: ['6', '3'], correctIndex: 0, explanation: 'Two times three is six.' },
    { id: 'open', type: 'open', stage: 'check', prompt: 'Explain a return value.', referenceAnswer: 'A result sent to the caller.' },
    codeExercise,
  ],
  flashcards: lesson.flashcards,
}

export function state(): PersistedState {
  return {
    profile: null, plan: null, lessons: {}, flashcards: [], weakSpots: [],
    stats: { xp: 0, streak: 0, lastActiveDay: null, history: [], daily: {} },
    settings: { provider: 'claude', model: '', effort: '', prefs: {}, claudeBin: '', codexBin: '', sound: false, volume: 0.6, jsRuntime: 'browser', setupDone: true, locale: 'en' },
  }
}

export function learningState(content = assessment): PersistedState {
  const saved = state()
  saved.profile = { description: 'I want to understand JavaScript functions.', minutesPerDay: 30, style: 'code' }
  saved.plan = { ...plan, createdAt: Date.now(), modules: [{ ...plan.modules[0], id: 'm0', lessons: [
    { ...plan.modules[0].lessons[0], id: 'first', kind: content === assessment ? 'test' : 'mixed', status: 'current' },
    { ...plan.modules[0].lessons[1], id: 'second', status: 'locked' },
  ] }] }
  saved.lessons.first = { ...content, format: 4, generatedAt: Date.now() }
  return saved
}

export function card(id: string, due = Date.now() - 60_000) {
  return { id, front: `Question ${id}`, back: `Answer ${id}`, source: 'E2E lesson', created: Date.now(), due, interval: 0, ease: 2.5, reps: 0, lapses: 0 }
}

export const responses = {
  plan: { data: plan }, refinePlan: { data: { ...plan, title: 'Revised JavaScript foundations' } }, lesson: { data: lesson },
  gradeOpen: { data: { score: 10, verdict: 'correct', headline: 'The mechanism is clear.', points: [{ kind: 'good', text: 'You identified the returned value.' }] } },
  reviewCode: { data: { passed: true, score: 10, summary: 'The implementation meets the requirement.', issues: [] } },
  ping: { data: { ok: true, message: 'E2E connection ready' } },
  chat: { data: 'A return value passes the computed result back to the caller.' },
  explain: { data: 'The return expression multiplies three by two.' },
  trace: { data: { headline: 'Follow the return expression.', steps: [{ line: 1, title: 'Return', say: 'Multiply by two.', output: ['6'], memory: [] }], takeaway: 'The function returns six.' } },
}
