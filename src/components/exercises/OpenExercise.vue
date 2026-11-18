<script setup>
import { ref, onMounted } from 'vue'
import Markdown from '../Markdown.vue'
import CodeBlock from '../CodeBlock.vue'
import Icon from '../Icon.vue'

const props = defineProps({
  exercise: { type: Object, required: true },
  modelValue: { type: String, default: '' },
  result: { type: Object, default: null },
  busy: Boolean,
})
const emit = defineEmits(['update:modelValue', 'submit'])
const showModel = ref(false)
const ta = ref(null)
onMounted(() => ta.value?.focus())

const POINT = {
  good: { icon: 'check', color: 'var(--green)' },
  bad: { icon: 'x', color: 'var(--red)' },
  tip: { icon: 'bulb', color: 'var(--yellow)' },
}
</script>

<template>
  <div class="ex">
    <span class="kind label">Pytanie otwarte</span>
    <Markdown tag="h1" class="q" :src="exercise.prompt" />
    <CodeBlock v-if="exercise.code" :code="exercise.code" :language="exercise.codeLanguage" />

    <div class="group">
      <label :for="`a-${exercise.id}`" class="label">Twoja odpowiedź</label>
      <textarea
        :id="`a-${exercise.id}`"
        ref="ta"
        class="field"
        rows="6"
        :value="modelValue"
        :readonly="!!result || busy"
        placeholder="Odpowiedz własnymi słowami — jak na rozmowie. Ctrl+Enter, aby sprawdzić."
        @input="emit('update:modelValue', $event.target.value)"
        @keydown.ctrl.enter.prevent="emit('submit')"
      />
    </div>

    <div v-if="busy" class="card grading">
      <span class="spinner" />
      <span>Claude czyta twoją odpowiedź…</span>
    </div>

    <div v-if="result?.status === 'unknown'" class="card feedback">
      <span class="label" style="color: var(--purple-link)">Wzorcowa odpowiedź</span>
      <Markdown :src="exercise.referenceAnswer" class="ptxt" />
      <template v-if="exercise.keyPoints?.length">
        <span class="label">Kluczowe elementy</span>
        <div v-for="(k, i) in exercise.keyPoints" :key="i" class="pt">
          <span class="pi" style="color: var(--yellow)"><Icon name="bulb" :size="18" :stroke="2.6" /></span>
          <Markdown inline tag="span" :src="k" class="ptxt" />
        </div>
      </template>
    </div>

    <div v-if="result?.data" class="card feedback">
      <div class="fh">
        <span class="tag" :class="result.status === 'correct' ? 'tag-green' : result.status === 'almost' ? 'tag-yellow' : 'tag-red'">
          {{ result.data.score }} / 10
        </span>
      </div>
      <div v-for="(p, i) in result.data.points" :key="i" class="pt">
        <span class="pi" :style="{ color: POINT[p.kind]?.color }"><Icon :name="POINT[p.kind]?.icon || 'bulb'" :size="18" :stroke="3" /></span>
        <Markdown :src="p.text" class="ptxt" />
      </div>
      <button class="link-btn" @click="showModel = !showModel">{{ showModel ? 'Ukryj' : 'Pokaż' }} wzorcową odpowiedź</button>
      <Markdown v-if="showModel" class="model" :src="result.data.modelAnswer || exercise.referenceAnswer" />
    </div>
  </div>
</template>

<style scoped>
.ex {
  display: flex;
  flex-direction: column;
  gap: 22px;
}
.kind {
  color: var(--purple-link);
}
.q {
  font-size: clamp(24px, 3.2vw, 32px);
  line-height: 1.25;
  font-weight: 900;
}
.q :deep(code) {
  font-size: 0.85em;
}
.group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.grading {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  font-weight: 700;
  color: var(--text-3);
}
.feedback {
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  animation: dl-pop 0.25s ease-out;
}
.fh .tag {
  font-size: 15px;
  font-weight: 900;
}
.pt {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.pi {
  flex: none;
  margin-top: 3px;
}
.ptxt {
  font-size: 16px;
  color: var(--text-2);
}
.link-btn {
  align-self: flex-start;
}
.model {
  background: var(--bg-deep);
  border-radius: 14px;
  padding: 14px 16px;
  color: var(--text-2);
}
</style>
