export type ProviderId = 'claude' | 'codex'
export type LearningStyle = 'code' | 'balanced' | 'theory'
export type LessonKind = 'theory' | 'output' | 'code' | 'mixed' | 'design' | 'test'
export type LessonStatus = 'locked' | 'current' | 'done'
export type ExerciseType = 'learn' | 'choice' | 'open' | 'code'
export type ExerciseStage = 'learn' | 'practice' | 'check' | 'challenge'
export type Runtime = 'browser' | 'docker' | 'review'
export type Rating = 'again' | 'hard' | 'good' | 'easy'

export interface Profile {
  description: string
  minutesPerDay: number
  style: LearningStyle
}

export interface LessonDescription {
  title: string
  kind: LessonKind
  focus: string
}

export interface ModuleDescription {
  title: string
  week: number
  description: string
  lessons: LessonDescription[]
}

export interface PlanDescription {
  title: string
  summary: string
  goal: string
  level: string
  levelSummary: string
  language: string
  durationWeeks: number
  weakSpots: string[]
  modules: ModuleDescription[]
}

export interface Lesson extends LessonDescription {
  id: string
  status: LessonStatus
}

export interface LessonModule extends Omit<ModuleDescription, 'lessons'> {
  id: string
  lessons: Lesson[]
}

export interface Plan extends Omit<PlanDescription, 'modules'> {
  createdAt: number
  modules: LessonModule[]
}

export type PlanPreview = Partial<Omit<PlanDescription, 'modules'>> & {
  modules?: (Omit<ModuleDescription, 'lessons'> & {
    lessons: (LessonDescription & Partial<Pick<Lesson, 'id' | 'status'>>)[]
  })[]
}

export interface LessonLocation extends Lesson {
  module: LessonModule
  moduleIndex: number
  lessonIndex: number
}

export interface WorkspaceFile {
  path: string
  content: string
}

export interface WorkspaceEntry {
  path: string
  dir: boolean
  size: number
  mtime?: number
  skipped?: boolean
}

export interface Concept {
  term: string
  explanation: string
}

export interface ToolDescription {
  name: string
  description: string
}

export interface SyntaxExample {
  title: string
  code: string
  explanation: string
}

export interface LessonMastery {
  independent: number
  assisted: number
  total: number
}

export interface LessonIntro {
  summary?: string
  outcome?: string
  outcomes?: string[]
  relevance?: string
  focus?: string
  hero?: { text: string; label?: string; kind?: string }[]
}

export interface Exercise {
  id: string
  type: ExerciseType
  stage: ExerciseStage
  prompt: string
  title?: string
  code?: string
  codeLanguage?: string
  options?: string[]
  correctIndex?: number
  explanation?: string
  referenceAnswer?: string
  keyPoints?: string[]
  hint?: string
  hints?: string[]
  syntax?: SyntaxExample[]
  prerequisites?: Concept[]
  visualization?: Record<string, unknown>
  comparison?: Record<string, unknown>
  requirements?: string[]
  toolbox?: ToolDescription[]
  example?: string
  expectedOutput?: string
  fileName?: string
  starterCode?: string
  tests?: string
  solution?: string
  files?: WorkspaceFile[]
  testFiles?: WorkspaceFile[]
  solutionFiles?: WorkspaceFile[]
  testCommand?: string
  runtime?: Runtime
  testsStatus?: string
  testsTotal?: number
  testsFixNote?: string
  warmup?: boolean
  trace?: CodeTrace
}

export interface CodeTrace {
  steps: TraceStep[]
  headline?: string
  mistake?: string
  takeaway?: string
}

export interface TraceStep {
  line?: number
  phase?: string
  title?: string
  note?: string
  skipped?: boolean
  say?: string
  why?: string
  output?: string[]
  memory?: { name: string; value: string; kind?: string; changed?: boolean }[]
}

export interface CodeIssue {
  line: number
  message: string
  severity?: string
  replacement?: string
  file?: string
}

export interface TestRun {
  results: { name: string; ok: boolean; error?: string; ms?: number }[]
  logs?: { level: string; text: string }[]
  compileError?: string
  output?: string
  timedOut?: boolean
  exitCode?: number
}

export type Verdict = 'correct' | 'almost' | 'wrong'

export interface Grade {
  score: number
  verdict?: Verdict
  feedback?: string
  good?: string
  missing?: string
  example?: string
  weakSpot?: string
  flashcard?: FlashcardText
}

export interface CodeReview extends Grade {
  passed: boolean
  summary: string
  issues: CodeIssue[]
}

export interface ExerciseResult {
  status: Verdict | 'practice' | 'error' | 'skipped' | 'unknown'
  data?: Partial<CodeReview>
  error?: string
  retry?: boolean
  assisted?: boolean
  solutionRevealed?: boolean
}

export interface FlashcardText {
  front: string
  back: string
}

export interface Flashcard extends FlashcardText {
  id: string
  source: string
  created: number
  due: number
  interval: number
  ease: number
  reps: number
  lapses: number
}

export interface LessonContent {
  intro: LessonIntro
  exercises: Exercise[]
  flashcards: FlashcardText[]
}

export interface CachedLesson extends LessonContent {
  generatedAt: number
  format: number
}

export interface ProviderPreference {
  model: string
  effort: string
}

export interface Settings extends ProviderPreference {
  provider: ProviderId
  prefs: Partial<Record<ProviderId, ProviderPreference>>
  claudeBin: string
  codexBin: string
  sound: boolean
  volume: number
  jsRuntime: 'browser' | 'docker'
  setupDone: boolean
  locale: string
  voiceDesign?: Record<string, number>
}

export interface PersistedState {
  profile: Profile | null
  plan: Plan | null
  lessons: Record<string, CachedLesson>
  flashcards: Flashcard[]
  weakSpots: string[]
  stats: {
    xp: number
    streak: number
    lastActiveDay: string | null
    history: { t: number; score: number }[]
    daily: Record<string, number>
  }
  settings: Settings
}

export interface ProviderStatus {
  id?: ProviderId
  available: boolean
  label?: string
  path?: string
  version?: string
}

export interface AppStatus {
  port?: number
  providers: Partial<Record<ProviderId, ProviderStatus>>
  features?: { dictation?: boolean; voice?: boolean }
  error?: boolean
}

export interface SandboxStatus {
  available: boolean
  envs?: Record<string, string>
  error?: string
  version?: string
}

export interface SetupJob {
  kind?: string
  status: 'running' | 'done' | 'error' | 'action-required'
  step?: string
  message?: string
  log: string[]
  error?: string | null
  progress?: { done: number; total: number; pct?: number; label?: string } | null
}

export interface SetupStatus {
  platform: string
  docker: {
    running: boolean
    installed: boolean
    version?: string
    endpoint?: string
    problem?: string
    help: {
      autoInstall?: boolean
      autoStart?: boolean
      install?: string[]
      start?: string[]
      permission?: string[]
      permissionHint?: string
      startHint?: string
      link?: string
    }
  }
  providers: Record<ProviderId, ProviderStatus & {
    auth?: { loggedIn: boolean | null; method?: string }
    install: string
    login: string
  }>
  dictation: { installed: boolean; python?: string; pythonTested: boolean; downloadMB: number }
  sandbox: Record<string, { label: string; ready: boolean }> | null
  jobs: Record<string, SetupJob>
}
