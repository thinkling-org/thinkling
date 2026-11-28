<script setup lang="ts">
import { computed } from 'vue'
import type { Exercise } from '../../domain.ts'
import { useLessonSupport } from '../../composables/useLessonSupport.ts'
import { t } from '../../lib/i18n.ts'
import Markdown from '../Markdown.vue'
import CodeBlock from '../CodeBlock.vue'
import Icon from '../Icon.vue'
import { UiButton } from '../ui/index.ts'

const { exercise, busy = false } = defineProps<{ exercise: Exercise; busy?: boolean }>()
const support = useLessonSupport()
const usage = computed(() => support?.read(exercise.id))
const hints = computed(() => (exercise.hints?.length ? exercise.hints : [exercise.hint]).filter((hint) => hint?.trim()))
const shownHints = computed(() => hints.value.slice(0, usage.value?.hints || 0))
</script>

<template>
  <aside v-if="support && (hints.length || exercise.syntax?.length)" class="support" :aria-label="t('Learning support')">
    <div class="support-actions">
      <UiButton v-if="hints.length" variant="ghost" size="sm" :disabled="busy || shownHints.length >= hints.length" @click="support.mark(exercise.id, 'hint')">
        <Icon name="bulb" :size="16" />{{ shownHints.length ? t('Next hint') : t('Hint me a step') }}
      </UiButton>
      <UiButton v-if="exercise.syntax?.length" variant="ghost" size="sm" :disabled="busy" :aria-expanded="!!usage?.syntax" @click="support.mark(exercise.id, 'syntax')">
        <Icon name="code" :size="16" />{{ t('Remind me of the syntax') }}
      </UiButton>
    </div>
    <div v-if="shownHints.length" class="hints" role="status">
      <Markdown v-for="(hint, index) in shownHints" :key="index" :src="hint" />
    </div>
    <div v-if="usage?.syntax" class="syntax">
      <section v-for="item in exercise.syntax" :key="item.title">
        <strong>{{ item.title }}</strong>
        <CodeBlock :code="item.code" :language="exercise.codeLanguage || ''" :line-numbers="false" />
        <Markdown :src="item.explanation" />
      </section>
    </div>
    <span v-if="support.isAssisted(exercise.id)" class="support-note">{{ t('With support · you can try a similar task on your own next.') }}</span>
  </aside>
</template>

<style scoped>
.support { display: grid; gap: 12px; margin-block: 16px; }
.support-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.support-actions .btn { text-transform: none; letter-spacing: normal; white-space: normal; text-align: left; }
.hints, .syntax { display: grid; gap: 12px; padding: 14px; border: 1px solid var(--purple-ring); border-radius: 12px; background: var(--purple-soft); line-height: 1.5; }
.syntax section { display: grid; gap: 8px; min-width: 0; }
.support-note { color: var(--muted); font-size: 13px; line-height: 1.5; }
</style>
