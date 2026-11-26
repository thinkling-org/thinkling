import type { Ref } from 'vue'
import type { CodeTrace, Exercise } from '../domain.ts'
import { t } from '../lib/i18n.ts'
import { computed, reactive, shallowRef } from 'vue'
import { ai } from '../lib/api.ts'
import { readComparisonSteps, readLessonVisualization } from '../blocks/registry.ts'

export function useLessonExamples(exercise: Readonly<Ref<Exercise | undefined>>) {
  const activeVariant = shallowRef(0)
  const comparisonIndex = shallowRef(0)
  const traceState = reactive<Record<string, { loading: boolean; chars: number; error: string | null }>>({})
  const comparisonVariant = computed(() => {
    const visualization = readLessonVisualization(exercise.value)
    return visualization?.type === 'code-comparison' ? visualization.variants[activeVariant.value] : null
  })
  const comparisonSteps = computed(() => readComparisonSteps(comparisonVariant.value))
  const comparisonStep = computed(() => comparisonSteps.value[comparisonIndex.value] || null)
  const hasNextComparisonStep = computed(() => comparisonIndex.value < comparisonSteps.value.length - 1)

  function selectVariant(index) {
    activeVariant.value = index
    comparisonIndex.value = 0
  }

  const traceProgress = computed(() => traceState[exercise.value?.id])

  async function requestTrace(chosenIndex: string | number | null) {
    const current = exercise.value
    if (!current?.code) return
    if (current.trace || traceState[current.id]?.loading) return
    traceState[current.id] = { loading: true, chars: 0, error: null }
    const progress = traceState[current.id]
    try {
      const data = await ai<CodeTrace>('trace', { exercise: current, chosenIndex }, { onProgress: (p) => (progress.chars = p.chars) })
      if (!data?.steps?.length) throw new Error(t('The model returned no steps'))
      current.trace = data
    } catch (err) {
      progress.error = err.message
    } finally {
      progress.loading = false
    }
  }

  function nextComparisonStep() {
    if (!hasNextComparisonStep.value) return false
    comparisonIndex.value++
    return true
  }

  function previousComparisonStep() {
    if (comparisonIndex.value <= 0) return false
    comparisonIndex.value--
    return true
  }

  return {
    activeVariant, comparisonVariant, comparisonStep, hasNextComparisonStep,
    selectVariant, nextComparisonStep, previousComparisonStep, traceProgress, requestTrace,
  }
}
