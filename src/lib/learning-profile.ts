import type { LearningStyle } from '../domain.ts'

export const LEARNING_TEMPLATES = [
  {
    label: 'Interview preparation',
    text: 'I\'m a senior frontend developer working with React and TypeScript. For interviews I want to review the event loop, closures, hoisting and this. Teach through frontend examples, then ask an interview-style question after I\'ve practiced.',
  },
  {
    label: 'New language: Go / Rust',
    text: 'I know JavaScript, TypeScript and the Node backend well. I want to get up to speed in Go or Rust, including syntax, types, error handling, concurrency and idioms. I prefer comparisons to JavaScript and short exercises.',
  },
  {
    label: 'Algorithms and data structures',
    text: 'I\'ve worked professionally for several years but my algorithms are rusty. I want to review complexity, arrays and hash maps, two pointers, sliding windows, recursion, trees, graphs (BFS/DFS) and dynamic programming. Use JavaScript exercises.',
  },
  {
    label: 'System design',
    text: 'I\'m a mid-level or senior backend developer. I want to improve my system design skills: scaling, caching, queues, SQL vs NoSQL, consistency, rate limiting and API design. Use open questions and short TypeScript tasks where coding fits.',
  },
  {
    label: 'Advanced TypeScript',
    text: 'I use TypeScript daily but mostly know the basics. I want to master generics, conditional and mapped types, infer, template literal types, narrowing, utility types and library type design.',
  },
]
export const DAILY_MINUTE_OPTIONS = [15, 30, 45, 60]
export const LEARNING_STYLES: readonly { id: LearningStyle; label: string }[] = [
  { id: 'code', label: 'More code' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'theory', label: 'Theory' },
]
