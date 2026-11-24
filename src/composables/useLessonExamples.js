import { t } from '../lib/i18n.js'
import { computed, reactive, shallowRef } from 'vue'
import { ai } from '../lib/api.js'
import { readComparisonSteps, readLessonVisualization } from '../lib/lesson-visualizations.js'

export function useLessonExamples(exercise) {
  const activeVariant = shallowRef(0)
  const comparisonIndex = shallowRef(0)
  const traceState = reactive({})
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

  async function requestTrace(chosenIndex) {
    const current = exercise.value
    if (!current?.code) return
    if (current.trace || traceState[current.id]?.loading) return
    const state = (traceState[current.id] = reactive({ loading: true, chars: 0, error: null }))
    try {
      const data = await ai('trace', { exercise: current, chosenIndex }, { onProgress: (p) => (state.chars = p.chars) })
      if (!data?.steps?.length) throw new Error(t('The model returned no steps'))
      current.trace = data
    } catch (err) {
      state.error = err.message
    } finally {
      state.loading = false
    }
  }

  function nextComparisonStep() {
    if (!hasNextComparisonStep.value) return false
    comparisonIndex.value++
    return true
  }

  return {
    activeVariant, comparisonVariant, comparisonStep, hasNextComparisonStep,
    selectVariant, nextComparisonStep, traceProgress, requestTrace,
  }
}
