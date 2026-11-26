// Prompts and JSON schemas for each AI task.
// Schemas are strict (see src/blocks/schema.ts). Lesson visualizations come from the block catalog.

import { arr, bool, int, obj, str } from '../src/blocks/schema.ts'
import { blockCatalog, selectBlocks, visualizationInstructions, visualizationSchema } from '../src/blocks/catalog.ts'
import { availableBlockSpecs } from './plugins.ts'
import type { BlockSpec } from '../src/blocks/schema.ts'
import { envFor } from './sandbox.ts'
import { languageName } from '../src/lib/languages.ts'
import type { Exercise, Plan, Profile, Runtime, TestRun, WorkspaceFile } from '../src/domain.ts'

const LANGUAGES = [
  'javascript', 'typescript', 'python', 'go', 'rust', 'java', 'csharp', 'cpp',
  'php', 'ruby', 'kotlin', 'swift', 'sql', 'other',
]
const LESSON_KINDS = ['theory', 'output', 'code', 'mixed', 'design', 'test']

export const SYSTEM_JSON = `You are Thinkling, a practical programming tutor. Adapt the depth of your explanations to the learner and the concept.
Write concise, technical explanations without filler or emoji. Format prose in Markdown with inline code and language-tagged code fences. Do not use tools.
Return only data that conforms to the supplied JSON schema.`

export const SYSTEM_CHAT = `You are Thinkling, a programming tutor. Adapt your explanation to what the learner knows about the concept.
Answer directly and concisely in Markdown, using language-tagged code fences. Help the learner produce an answer: diagnose one obstacle, explain only what is needed and invite one small next attempt. Ask at most one focused question at a time when it helps. Supply missing syntax with a tiny analogous example rather than demanding the learner guess unfamiliar notation. By default, offer a next step rather than the complete solution; provide the complete solution when the learner explicitly requests it. After showing a solution, invite them to solve a similar task with less help. Avoid emoji and stock openings such as "Great question." Do not use tools.`

export const SYSTEM_GRADE = `You are Thinkling, a programming tutor. Assess what the learner understood after a lesson and help them take the next step.
Keep feedback concise and use Markdown. Base your comments on what the learner actually wrote. Do not use tools.
Return only data that conforms to the supplied JSON schema.`

export function withResponseLanguage(system: string, locale: string) {
  return `${system}

Response language: ${languageName(locale)} (${locale}). Write all learner-facing prose, including titles, explanations, hints, feedback, flashcards and labels, in this language. The examples and supplied learner context may be in other languages. Keep JSON keys, schema enum values, programming syntax and identifiers unchanged. Preserve exact program output and any literals the tests require.`
}

// ---------------------------------------------------------------- plan

const planSchema = (blocks: readonly BlockSpec[]) => obj({
  title: str,
  summary: str,
  goal: str,
  level: str,
  levelSummary: str,
  language: { type: 'string', enum: LANGUAGES },
  durationWeeks: int,
  weakSpots: arr(str),
  modules: arr(
    obj({
      title: str,
      week: int,
      description: str,
      lessons: arr(
        obj({
          title: str,
          kind: { type: 'string', enum: LESSON_KINDS },
          focus: str,
          blocks: arr({ type: 'string', enum: blocks.map((block) => block.id) }),
        }),
      ),
    }),
  ),
})

const STYLE_LABEL = {
  code: 'more code and practical exercises, less theory',
  balanced: 'a balance of theory and practice',
  theory: 'more theory questions and explanations of how things work',
}

function planRules(blocks: readonly BlockSpec[]) {
  return `Plan rules:
- Field order matters for streaming to the UI. Emit "title", "summary", "goal", "level" and "levelSummary" first, then the remaining fields.
- "title": memorable, at most 6 words. "summary": 1–2 sentences. "goal": 1 sentence, at most 20 words.
- Assess the learner's level. Set "level" to one of "Junior", "Mid", "Senior", or "Lead", and "levelSummary" to 1–2 sentences about their main gaps.
- "weakSpots": up to 6 short topics reported by the learner or evident from their description. Use [] if there is no evidence.
- Use 4–8 modules with 5–8 lessons each. Order modules from fundamentals to advanced topics. "week" is a 1-based week number.
- Set a "durationWeeks" that is realistic given the daily time budget.
- Each lesson has a "kind":
  - "theory": a concept explained with an example, guided practice, and a check for understanding.
  - "output": demonstrate a mechanism, guide practice, then ask the learner to predict the behavior of similar code.
  - "code": demonstrate a technique, guide practice, then offer a small coding task.
  - "mixed": a concept with an example, guided practice, and an application.
  - "design": a design decision without code, such as architecture, load estimation, databases, caches, queues, rate limits, or fault tolerance. Use a diagram or simulation, guided practice, and a trade-off discussion.
  - "test": a module assessment. This is always the last lesson of each module.
- Choose "kind" based on the skill, not the plan's programming language. Use "code" and "output" only for reading or writing code, such as implementing a token bucket or an idempotent consumer. Use "design" or "theory" for estimation, architecture, trade-offs, and failure behavior, even if the learner requests coding tasks. Most lessons in a system design plan should use these two kinds.
- "focus": one sentence about a concrete skill the learner will acquire or reinforce.
- "blocks": 0–2 interactive visualizations the lesson's worked example may use, chosen from the catalog below. Pick the ones that let the learner observe this lesson's mechanism; prefer one. Use [] for "test" lessons and when none fits. The lesson author can only use the blocks you list.
${blockCatalog(blocks)}
- Make lesson titles brief and specific (2–5 words).
- "language": the plan's main programming language for the editor and coding lessons.
- Use seniority and experience to set the pace. Infer concept familiarity from the learner's own description. Draw examples from their known languages, tools, and work situations.
- For interview preparation, teach and practice first, then use the module assessment for an interview simulation. Include algorithms when they fit the stated goal.`
}

export function planTask({ description, minutesPerDay, style }: Profile) {
  const blocks = availableBlockSpecs()
  return {
    schema: planSchema(blocks),
    prompt: `Create a personalized programming study plan made of short lessons arranged in a sequence of modules.

## Learner description (in their own words)
${description}

## Preferences
- Time per day: ${minutesPerDay} min
- Learning style: ${STYLE_LABEL[style] || STYLE_LABEL.balanced}

${planRules(blocks)}`,
  }
}

export function refinePlanTask({ description, minutesPerDay, style, plan, feedback }: Profile & { plan: Plan; feedback: string }) {
  const blocks = availableBlockSpecs()
  const slim = {
    ...plan,
    modules: plan.modules.map((m) => ({
      title: m.title,
      week: m.week,
      description: m.description,
      lessons: m.lessons.map((l) => ({ title: l.title, kind: l.kind, focus: l.focus, blocks: l.blocks, done: l.status === 'done' })),
    })),
  }
  return {
    schema: planSchema(blocks),
    prompt: `Revise the existing study plan using the learner's feedback. Keep lessons marked "done": true unchanged, with identical titles in the same order at the beginning of their module, unless the learner explicitly asks otherwise.

## Learner description
${description}
Time per day: ${minutesPerDay} min · Style: ${STYLE_LABEL[style] || STYLE_LABEL.balanced}

## Current plan (JSON)
${JSON.stringify(slim, null, 1)}

## Learner feedback
${feedback}

${planRules(blocks)}
Return the complete revised plan.`,
  }
}

// ---------------------------------------------------------------- lesson

const exerciseSchema = (blocks: readonly BlockSpec[]) => obj({
  type: { type: 'string', enum: ['learn', 'choice', 'code', 'open'] },
  stage: { type: 'string', enum: ['learn', 'practice', 'check', 'challenge'] },
  prompt: str,
  code: str,
  codeLanguage: str,
  options: arr(str),
  correctIndex: int,
  explanation: str,
  referenceAnswer: str,
  keyPoints: arr(str),
  hint: str,
  hints: arr(str),
  syntax: arr(obj({ title: str, code: str, explanation: str })),
  prerequisites: arr(obj({ term: str, explanation: str })),
  visualization: visualizationSchema(blocks),
  title: str,
  requirements: arr(str),
  toolbox: arr(obj({ name: str, description: str })),
  example: str,
  expectedOutput: str,
  fileName: str,
  starterCode: str,
  tests: str,
  solution: str,
  // tryb "docker": prawdziwy projekt w kontenerze
  files: arr(obj({ path: str, content: str })),
  testFiles: arr(obj({ path: str, content: str })),
  solutionFiles: arr(obj({ path: str, content: str })),
  testCommand: str,
})

const lessonSchema = (blocks: readonly BlockSpec[]) => obj({
  intro: obj({
    summary: str,
    outcome: str,
    outcomes: arr(str),
    relevance: str,
    focus: str,
    hero: arr(obj({ text: str, label: str, kind: { type: 'string', enum: ['input', 'operation', 'value', 'result', 'symbol'] } })),
  }),
  exercises: arr(exerciseSchema(blocks)),
  flashcards: arr(obj({ front: str, back: str })),
})

const CHECK_BY_KIND = {
  theory: 'one "open" or "choice" that checks understanding of the mechanism',
  output: 'one "choice" asking the learner to predict the behavior of similar code',
  code: 'one short "code" exercise applying the demonstrated technique',
  mixed: 'one short "code" or "open" applying the demonstrated technique. Use "code" if the solution is code, or "open" for calculations and design decisions',
  design: 'one "open" asking for a design decision in a new, concrete scenario and a justification of the trade-offs, with numbers when appropriate. Include one "keyPoints" criterion per decision or trade-off',
}

const RUNNABLE = ['javascript', 'typescript']

function dockerRules(lang) {
  const env = envFor(lang)
  return `The app runs "code" exercises in Docker (${env?.label || lang}, Bash, /workspace), without network access. Use only the language standard library. Package installation commands will not work. The learner has an editor, file tree and terminal.
- "files": 1–3 small starter files [{path, content}], with relative paths, signatures, and TODO comments. In guided practice, provide working surrounding code and leave only one small targeted gap or change; do not ask for an entire program. Omit the completed solution.
- "testFiles": files [{path, content}] under "tests/". Use a minimal custom harness in plain ${lang}. Print exactly one stdout line per test:
    PASS <test name>
    FAIL <test name> :: <briefly: expected X, got Y>
  When the language allows it, catch each test failure and keep running the remaining tests. Exit 1 if any failed, otherwise 0. Use 3–6 fast, deterministic tests.
- "testCommand": a single Bash command running in /workspace that compiles if needed and executes the tests, e.g. \`${env?.testExample || 'bash tests/run.sh'}\`. Put build artifacts under /tmp.
- "solutionFiles": model versions of the files in "files", using identical paths and passing all tests. Include any additional configuration files the learner is explicitly required to create.
- "fileName": the main editable path from "files". Set "starterCode", "tests" and "solution" to "".
- Explain unfamiliar placeholder identifiers in the lesson where they are introduced. Keep required identifiers and configuration values consistent across the requirements, examples, starter, reference solution and tests. Only test an exact name when the requirements explicitly specify it.
- If the task teaches project initialization or creating a configuration file, leave that file for the learner to create and include it in the reference solution. Otherwise provide working project configuration in the starter; do not ask the learner to initialize an already initialized project.`
}

function codeRules(lang: string, runtime?: string) {
  if (runtime === 'docker') return dockerRules(lang)
  if (RUNNABLE.includes(lang) && runtime !== 'review') {
    return `The browser runs "code" exercises in ${lang} automatically:
- "starterCode": use regular declarations (\`function foo(){}\`, \`class Foo {}\`) and omit import/export/require. In guided practice provide working surrounding code and one small TODO for the learner to complete or change. In independent checks use a minimal scaffold with familiar signatures. Omit the completed solution.
- "tests": plain JavaScript, including for TypeScript lessons. Refer to the starter declarations by name. Available globals:
  \`test(name, async () => {...})\`, \`expect(x).toBe/toEqual/toBeTruthy/toBeFalsy/toContain/toHaveLength/toBeCloseTo/toBeGreaterThan/toBeLessThan/toBeInstanceOf/toThrow(msg?)\`, \`.not\`, \`await expect(promise).rejects.toThrow()\`, \`await sleep(ms)\`, \`mockFn(impl?)\` (with \`.calls\` argument arrays and \`.contexts\` for this values).
  Write 3–6 deterministic tests that finish in under 2 s altogether (timers around 100 ms at most). Avoid the DOM, network and imports.
- "solution": a complete reference implementation that passes all tests.
- "fileName": for example "debounce.${lang === 'typescript' ? 'ts' : 'js'}".`
  }
  return `For "code" exercises in ${lang}, the model reviews the answer without running it. In "tests", describe 3–5 cases in a Markdown list (input → expected result). "starterCode": signature and TODO without the solution. "solution": reference implementation. Use the right extension for "fileName". Set "files", "testFiles", "solutionFiles" to [] and "testCommand" to "".`
}

export function lessonTask({ profile, plan, moduleIndex, lessonIndex, weakSpots, runtime }: {
  profile: Profile
  plan: Plan
  moduleIndex: number
  lessonIndex: number
  weakSpots?: string[]
  runtime?: Runtime
}) {
  const mod = plan.modules[moduleIndex]
  const lesson = mod.lessons[lessonIndex]
  const lang = plan.language || 'javascript'
  // Only the blocks the planner chose for this lesson reach the prompt and schema.
  const blocks = selectBlocks(lesson.blocks, availableBlockSpecs())
  const blockIds = blocks.map((block) => block.id)
  const designVisualization = blockIds.includes('system-sim')
    ? ' Use an appropriate visualization in the worked example, including system-sim where interaction helps.'
    : blocks.length ? ' Use an appropriate visualization in the worked example.' : ''
  const visualizationRules = blocks.length
    ? `- Use "visualization" only for "learn" cards when it helps the learner observe the mechanism. Otherwise use null.
${visualizationInstructions(blocks)}
  Choose the visualization that best demonstrates the mechanism. It is optional unless the sequence specifies otherwise.`
    : '- Set "visualization" to null on every card.'
  const earlier = plan.modules
    .slice(0, moduleIndex + 1)
    .flatMap((m, mi) => m.lessons
      .filter((l, li) => l.status === 'done' && (mi < moduleIndex || li < lessonIndex))
      .map((l) => l.focus || l.title))
  const sequence = lesson.kind === 'test'
    ? 'After the introduction, include 4–6 exercises based on completed lessons in this module, all with stage "check". Choose a mix of "choice", "code" and "open" appropriate for the material and the learner’s goal. Use "code" only for coding skills, and use "open" or "choice" for design decisions and estimates.'
    : `Build 7–9 short steps in this order, increasing independence gradually:
1. One or two "learn" cards with a concrete worked example and the syntax or notation needed to reproduce it. Explain one small concept at a time.
2. At least three "practice" exercises, normally four. Start with predicting a result or identifying one operation, then ask the learner to complete one gap, change one thing, and briefly explain a choice. Include at least one productive task ("open" or "code"), not only multiple-choice questions. These are ungraded attempts with retry and optional help.
3. One or two "check" exercises applying the same mechanism to a new, similar example with less scaffolding: ${CHECK_BY_KIND[lesson.kind] || CHECK_BY_KIND.mixed}. Do not introduce a new requirement or unfamiliar syntax here.
4. Optionally one final "choice" at stage "challenge", only on previously demonstrated mechanisms and within the total of 7–9 steps.
${lesson.kind === 'design' ? `Use decisions, predictions, small calculations and explanations for practice; do not include code exercises.${designVisualization}` : 'When the check asks for code, include at least two earlier code exercises at stage practice: a tiny completion with most of the code supplied, followed by a small modification with less scaffolding. Do not jump from recognition quizzes to writing a complete program.'}
Every practice exercise must have a full explanation and hints. Use small, genuinely different variants of the same skill so that after reading a solution the learner can try again in the next task instead of copying the same answer.`
  return {
    schema: lessonSchema(blocks),
    prompt: `Prepare one short lesson.

## Learner
${profile.description}
Level: ${plan.level} — ${plan.levelSummary}
Time per day: ${profile.minutesPerDay} min · Style: ${STYLE_LABEL[profile.style] || STYLE_LABEL.balanced}
Topics to revisit and possible gaps: ${(weakSpots || []).join(', ') || 'no data'}

## Plan: ${plan.title} (programming language: ${lang})
Learner goal: ${plan.goal || 'see the learner description'}
Module ${moduleIndex + 1}: ${mod.title} — ${mod.description}
Lesson ${lessonIndex + 1}/${mod.lessons.length}: **${lesson.title}** (kind: ${lesson.kind})
Focus: ${lesson.focus}
Topics from earlier completed lessons: ${earlier.slice(-12).join('; ') || 'none'}

## Lesson introduction
Fill in "intro". Keep the welcome screen brief and concrete:
- "summary": 2–3 sentences. Start from a practical problem and give a simple analogy or observation (e.g. Python treats "45000" as characters just like "Toyota"). Avoid revealing the entire solution.
- "outcome": one sentence about what the learner will be able to do or practice in an assessment.
- "outcomes": exactly 3 short skills, about 9 words each at most, progressing from recognition to application to result. Write infinitive phrases completing the heading "In this lesson you'll learn to:" (or "In this assessment you'll practice:"). Describe learning goals, not prerequisites or skills already mastered. For example, use "Recognize...", "Check...", "Explain...", never "You recognize..." or "You can already...". Follow the response language's grammar.
- "relevance": a real task this helps with. Relate it to the learner's goal and stated experience.
- "focus": a specific decision or part of the code to watch in the example, without revealing the answer.
- "hero": 3–6 elements showing one meaningful transformation from left to right, using kinds "input", "operation" (e.g. "int()", "await", "JOIN"), "value", "result", and "symbol" (an unframed link such as "+ 1200 ="). Use a literal value or code for "text" (about 14 characters max), with a 1–3 word "label" underneath, or "" for symbols. Example: "45000" (input, string) → int() (operation, conversion) → 45000 (value, number) → + 1200 = (symbol) → 46200 (result, total). Use [] if there is no meaningful transformation.

## Sequence
${sequence}

## Teaching approach
- Start from a practical problem. Use a language, tool or work situation from the learner's description when available. Avoid inventing their experience.
- Senior or Lead experience alone does not establish familiarity with patterns, libraries or APIs. Explain the necessary concept at first use. For a factory, show how a function creates an object before naming the pattern. For bind, show what it returns and how it changes invocation.
- When a card depends on a concept that may need review, put its short name in "prerequisites[].term" and a plain-language explanation with a simpler concrete Markdown example in "prerequisites[].explanation". Explain the minimum needed for the card in its main text as well.
- Practice and the first check should apply only the demonstrated mechanism and closely match the example. Save traps and subtleties for an optional challenge or later assessment.
- Keep each practice task small enough for a focused attempt. Increase the learner's contribution gradually while reducing prefilled code. Have them predict, complete, modify, explain and reproduce; do not pad the lesson with more passive theory or repeated recognition quizzes.
- Reminders of syntax remain available in independent checks. Help is tracked separately from correctness; practice mistakes do not lower the lesson score. Never assume knowledge of a programming language solely from seniority in another language.

## Exercise format
All fields are required. Use "" / [] / 0 / null for unused fields.
- "learn": "title" names one concept. "prompt" explains a practical problem, the mechanism and what to watch (up to 4 sentences or about 70 words). "code" is a worked example of up to 8 lines, only when the concept is a code construct. Use "" for estimation, architecture and trade-offs. Do not wrap calculations in functions. Set "codeLanguage", "explanation" (why it works, 1–2 sentences) and "keyPoints" (2–3 short rules).
${visualizationRules}
- "practice": use "choice", "open" or "code". State one small action in "prompt". Include "explanation" describing why the completed attempt works. For code tasks, give a usable scaffold and tests checking only that small requirement. These exercises can be retried and do not contribute to grades or XP.
- "hints": 2–3 short Markdown hints for each practice and check, progressing from a question or observation to a concrete next step. Avoid the complete solution. Set "hint" to the first hint for compatibility. Use [] and "" for unused hints.
- "syntax": 1–3 reminders [{title, code, explanation}] for code practice and code checks. Use small analogous examples with different values, showing only relevant syntax or commands. They must not be the finished answer to the current task. Use [] when syntax is not needed. This content is lesson data; the UI must not need language-specific teaching rules.
- "open": one focused question about the mechanism. State any subquestions in "prompt". Give a concise "referenceAnswer" and one "keyPoints" criterion for each distinct part. Optional "code" if needed.
- "choice": use a question in "prompt", optional "code" and "codeLanguage", 3–4 "options", zero-based "correctIndex", and a 2–4 sentence Markdown "explanation". For output questions, use exact output, one correct answer and distractors based on typical mistakes.
- "code": use "title", "prompt", 3–5 "requirements", and 2–5 "toolbox" entries [{name, description}] for relevant functions, methods or constructs. Describe behavior without giving away the order or solution. Set "toolbox" to [] for other exercise types. If tests check exact output, state it in "requirements" and put the exact output, including required spaces and line breaks, in "expectedOutput". Use "" for "expectedOutput" when output is not explicitly required, including other exercise types. Also fill "example" with a short usage example in Markdown: prose remains prose; code and terminal commands use fenced blocks with the appropriate language tag. Fill "codeLanguage", "fileName", "starterCode", "tests" and "solution".
${codeRules(lang, runtime)}
${runtime === 'docker' ? '' : '- Use [] for "files", "testFiles", "solutionFiles" and "" for "testCommand".'}

## Flashcards
"flashcards": 2–4 cards reviewing key concepts. "front" asks a question and can include code. "back" gives a concise answer.`,
  }
}

// ---------------------------------------------------------------- test repair

const fixTestsSchema = obj({ tests: str, solution: str, starterCode: str, note: str })

function fmtRun(run?: TestRun | null) {
  if (!run) return '(not run)'
  if (run.compileError) return `Execution error: ${run.compileError}`
  return run.results.map((r) => `${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.ok ? '' : ` — ${r.error}`}`).join('\n') || '(no tests)'
}

const fileArr = arr(obj({ path: str, content: str }))
const fixSandboxSchema = obj({ files: fileArr, testFiles: fileArr, solutionFiles: fileArr, testCommand: str, note: str })

function fmtFiles(list?: WorkspaceFile[]) {
  return (list || []).map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n') || '(none)'
}

export function fixTestsTask({ exercise, language, solutionRun, starterRun, runtime }: {
  exercise: Exercise
  language?: string
  solutionRun?: TestRun
  starterRun?: TestRun
  runtime?: Runtime
}) {
  const lang = language || exercise.codeLanguage || 'javascript'
  if (runtime === 'docker') {
    return {
      schema: fixSandboxSchema,
      prompt: `Automatic verification in a real Docker container found a problem. The reference solution must pass all tests and the starter files must fail at least one.

## Exercise: ${exercise.title}
${exercise.prompt}

## Requirements (preserve these when repairing tests)
${(exercise.requirements || []).map((requirement) => `- ${requirement}`).join('\n')}
${exercise.expectedOutput ? `\n## Expected output (exact)\n\`\`\`\n${exercise.expectedOutput}\n\`\`\`` : ''}

## testCommand
\`${exercise.testCommand}\`

## files (starter)
${fmtFiles(exercise.files)}

## solutionFiles
${fmtFiles(exercise.solutionFiles)}

## testFiles
${fmtFiles(exercise.testFiles)}

## Results: solutionFiles + testFiles
${fmtRun(solutionRun)}

## Results: files + testFiles
${fmtRun(starterRun)}

## Repair
Find and fix the cause, such as a compile error, incorrect path or command, wrong expected value, missing PASS/FAIL output, or an unavailable dependency. Preserve the explicit requirements, including any required module path. The container has no network. Return complete "files", "testFiles", "solutionFiles" and "testCommand". In "note", summarize the fix in one sentence.

${dockerRules(lang)}`,
    }
  }
  return {
    schema: fixTestsSchema,
    prompt: `Automatic verification found a problem. The reference solution must pass all tests and the starter code must fail at least one.

## Exercise: ${exercise.title}
${exercise.prompt}
Requirements:
${(exercise.requirements || []).map((r) => `- ${r}`).join('\n')}
${exercise.expectedOutput ? `\nExpected output (exact):\n\`\`\`\n${exercise.expectedOutput}\n\`\`\`` : ''}

## starterCode
\`\`\`${lang}
${exercise.starterCode}
\`\`\`

## solution
\`\`\`${lang}
${exercise.solution}
\`\`\`

## tests
\`\`\`js
${exercise.tests}
\`\`\`

## Results: solution
${fmtRun(solutionRun)}

## Results: starterCode
${fmtRun(starterRun)}

## Repair
Determine whether the tests are wrong (e.g. wrong expected value, nondeterminism, short timer, unavailable API) or the reference solution is wrong. Fix the cause and preserve the task's intent and starter identifiers. Return complete "tests", "solution" and "starterCode", leaving valid fields intact. In "note", summarize the fix in one sentence.

${codeRules(lang)}`,
  }
}

// ---------------------------------------------------------------- open-answer grading

const gradeSchema = obj({
  score: int,
  verdict: { type: 'string', enum: ['correct', 'almost', 'wrong'] },
  headline: str,
  points: arr(obj({ kind: { type: 'string', enum: ['good', 'bad', 'tip'] }, text: str })),
  modelAnswer: str,
  weakSpot: str,
  flashcard: obj({ front: str, back: str }),
})

export function gradeOpenTask({ exercise, answer, level }: { exercise: Exercise; answer: string; level?: string }) {
  return {
    schema: gradeSchema,
    prompt: `Grade the learner's answer after the lesson. Their level (${level || 'not specified'}) determines how to explain the feedback. Apply the same grading scale at all levels.

## Question
${exercise.prompt}
${exercise.code ? `\n\`\`\`${exercise.codeLanguage || ''}\n${exercise.code}\n\`\`\`\n` : ''}
## Reference answer
${exercise.referenceAnswer || '(none)'}

## Grading guidance
${(exercise.keyPoints || []).map((k) => `- ${k}`).join('\n') || '(grade from the question)'}

## Learner answer
${answer || '(no answer)'}

## Grading rules
${exercise.stage === 'practice' ? '- This is guided, ungraded practice. Keep feedback gentle and focused on one next action. The score is internal feedback, not a lesson grade. Suggest a small next attempt and do not introduce additional requirements.\n' : ''}
- Identify the explicit requirements of the question. Use the reference and guidance as aids. Count different phrasings of one mechanism as one criterion. Details outside the question are optional.
- Accept answers in the learner's own words, equivalent code, and clear implications. Repeating operation names or prior values does not earn separate points.
- Weight requirements by importance. Give credit for a correct approach without exact syntax. If the question explicitly requests a declaration or code, distinguish a syntax omission from skipping the entire requirement.
- Assess meaning. Deduct for substantive errors or explicit omissions, and count each gap only once. Use "tip" for optional refinements without score deductions.
- Score 9–10 for all essential requirements addressed, 8 for the right mechanism with a small omission, 5–7 for partial understanding with a substantive gap, and 0–4 for mostly incorrect or missing reasoning. Use the upper part of 5–7 when the main mechanism is clear and one significant point is missing.

## Format
- "score": 0–10. "verdict": "correct" (8–10), "almost" (5–7), "wrong" (0–4).
- "headline": one short sentence describing what was understood or needs work.
- "points": 1–3 distinct points. Use "good" for a correct explanation, "bad" for a specific error or gap with a correction, and "tip" for an optional refinement. Avoid duplicate or contradictory points.
- "modelAnswer": a concise reference answer in Markdown.
- "weakSpot": a short topic (1–3 words) for a significant gap, or "".
- "flashcard": create one for a specific understanding gap when the verdict is "almost" or "wrong". Otherwise use empty strings for both fields.`,
  }
}

// ---------------------------------------------------------------- code review

const reviewSchema = obj({
  passed: bool,
  score: int,
  headline: str,
  summary: str,
  issues: arr(
    obj({
      file: str,
      line: int,
      severity: { type: 'string', enum: ['error', 'warning', 'info'] },
      message: str,
      replacement: str,
    }),
  ),
  weakSpot: str,
  flashcard: obj({ front: str, back: str }),
})

export function reviewCodeTask({ exercise, code, files, testResults, level }: {
  exercise: Exercise
  code?: string
  files?: WorkspaceFile[]
  testResults?: TestRun | null
  level?: string
}) {
  const num = (src) =>
    String(src || '')
      .split('\n')
      .map((l, i) => `${String(i + 1).padStart(3, ' ')} | ${l}`)
      .join('\n')
  const numbered = files?.length
    ? files.map((f) => `=== ${f.path} ===\n${num(f.content)}`).join('\n\n')
    : num(code)
  const testsText = files?.length ? fmtFiles(exercise.testFiles) : exercise.tests
  const tr = testResults
    ? fmtRun(testResults)
    : 'Tests were not run automatically. Evaluate correctness against the provided cases.'
  return {
    schema: reviewSchema,
    prompt: `Review the learner's solution as an experienced reviewer (learner level: ${level || 'senior'}).

## Exercise: ${exercise.title}
${exercise.prompt}

Requirements:
${(exercise.requirements || []).map((r) => `- ${r}`).join('\n')}
${exercise.expectedOutput ? `\nExpected output (exact):\n\`\`\`\n${exercise.expectedOutput}\n\`\`\`` : ''}

Tests:
${testsText}

## Test results
${tr}

## Learner code (line numbers included)
\`\`\`
${numbered}
\`\`\`

## Format
- "passed": true only if the requirements are satisfied. If tests ran and any failed, use false.
${exercise.stage === 'practice' ? '- This is a small ungraded practice attempt. Review only its stated requirement, give one concrete next step, and encourage a retry. Do not treat the unfinished surrounding learning sequence as missing requirements.\n' : ''}
- "score": 0–10.
- "headline": one short sentence for the footer.
- "summary": 2–4 sentences of Markdown feedback.
- Guide the learner toward a fix by pointing to the error, mechanism and next step. Omit the complete solution, which the app shows separately. For nearly unchanged starter code, give 1–2 starting hints instead of listing every omission.
- "issues": 0–5 comments pinned to numbered lines. "file" is the path from the "=== … ===" header, or "" for a single code snippet. "message" names the concrete issue, for example "this is lost here because …". Provide "replacement" only if the fix fits the same line, including its indentation. Otherwise use "".
- "weakSpot": a short topic name or "".
- "flashcard": if "passed" is false, reinforce the key lesson of the mistake. Otherwise use "" in both fields.`,
  }
}

// ---------------------------------------------------------------- explanations and chat

export function explainTask({ exercise, chosenIndex }: { exercise: Exercise; chosenIndex: number }) {
  return {
    prompt: `Explain step by step why the correct answer works and the learner's choice does not. For code output, trace execution line by line, including call stacks, queues and variable values when relevant.

## Question
${exercise.prompt}
${exercise.code ? `\`\`\`${exercise.codeLanguage || ''}\n${exercise.code}\n\`\`\`` : ''}

Options:
${exercise.options.map((o, i) => `${i + 1}. ${o}`).join('\n')}

Correct choice: ${exercise.correctIndex + 1}. Learner choice: ${chosenIndex + 1}.`,
  }
}

const MEM_KINDS = ['function', 'string', 'number', 'boolean', 'object', 'undefined', 'uninitialized', 'other']

const traceSchema = obj({
  headline: str,
  mistake: str,
  takeaway: str,
  steps: arr(
    obj({
      phase: str,
      line: int,
      title: str,
      say: str,
      note: str,
      skipped: bool,
      memory: arr(obj({ name: str, value: str, kind: { type: 'string', enum: MEM_KINDS }, changed: bool })),
      output: arr(str),
    }),
  ),
})

export function traceTask({ exercise, chosenIndex }: { exercise: Exercise; chosenIndex?: number | null }) {
  const numbered = String(exercise.code || '')
    .split('\n')
    .map((l, i) => `${String(i + 1).padStart(3, ' ')} | ${l}`)
    .join('\n')
  const correct = chosenIndex === exercise.correctIndex
  const learning = exercise.type === 'learn'
  const context = learning
    ? `## Knowledge card: ${exercise.title}
${exercise.prompt}
${exercise.explanation || ''}
${(exercise.keyPoints || []).join('\n')}`
    : `## Question
${exercise.prompt}`
  const options = learning ? '' : `Options:
${exercise.options.map((o, i) => `${i + 1}. ${o}`).join('\n')}
Correct choice: ${exercise.correctIndex + 1}. Learner choice: ${chosenIndex == null ? 'none' : chosenIndex + 1}${chosenIndex == null ? '' : correct ? ' (correct)' : ' (incorrect)'}.

`
  return {
    schema: traceSchema,
    prompt: `Prepare an interactive trace of the code, like a debugger guided by a tutor. Each step highlights one line and shows memory and console output.

${context}

## Code (line numbers matter)
\`\`\`
${numbered}
\`\`\`

${options}## Rules
- Use 4–10 "steps" in the actual engine's order. Use a short uppercase "phase" such as "PHASE 1 · CREATION", "PHASE 2 · EXECUTION", or "MICROTASKS" when relevant, otherwise "".
- Use a 1-based "line" from the listing. Separate relevant operations on the same line into steps. In calculations show the operation and intermediate value. Add console output only when printed.
- "title": up to 6 words, such as "Read the value of foo". ${learning ? 'Name the operation.' : 'Identify the exact step where the learner’s reasoning went wrong, if applicable.'}
- "say": 1–2 sentences addressed to the learner. ${learning ? 'Relate the step to the concept and explain every important state change. The learner did not answer a question.' : 'Address the mistaken assumption at the relevant step, if applicable.'}
- "note": a trailing comment up to 40 characters (e.g. "foo = ƒ foo()" or "→ microtask queue") or "".
- "skipped": true if the line does nothing in this step.
- "memory": full state after the step (up to 6 relevant variables). Show "value" as the console would, including quotes for strings and "ƒ foo()" for functions. Use "uninitialized" for TDZ and set "changed" when the value changes. For event loop examples, queue entries such as "microtasks" can use kind "other".
- "output": cumulative console output after the step, exactly as printed. The final result must match ${learning ? 'execution of the example. Leave output empty when the code prints nothing' : 'the correct answer'}.
- "headline": one short sentence about the key idea, at most 120 characters.
- "mistake": 1–2 sentences about ${learning ? 'the crucial behavior and a common mistake' : correct ? 'the key to answering correctly' : 'the exact point where the reasoning went wrong'}.
- "takeaway": one rule to remember, in one sentence.`,
  }
}

export function chatTask({ context, history, question }: {
  context?: string
  history?: { role: 'user' | 'assistant'; content: string }[]
  question: string
}) {
  const conv = (history || []).map((m) => `**${m.role === 'user' ? 'Learner' : 'Thinkling'}:** ${m.content}`).join('\n\n')
  return {
    prompt: `Answer the learner's follow-up in the context of the exercise. Diagnose code using the current learner workspace files and the supplied test results. The learner may have edited the code since the last test run: distinguish current source from earlier errors. When files or test results are unavailable, say what is missing instead of assuming the code is empty or inventing failures. Explain unfamiliar notation and placeholder identifiers when relevant to the learner's question.

## Exercise context
${context}

${conv ? `## Conversation so far\n${conv}\n` : ''}
## Learner question
${question}`,
  }
}

export function pingTask() {
  return { schema: obj({ ok: bool, message: str }), prompt: 'Connection test. Return ok=true and a short greeting in "message".' }
}
