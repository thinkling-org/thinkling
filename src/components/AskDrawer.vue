<script setup>
import { nextTick, ref, watch } from 'vue'
import { ai } from '../lib/api.js'
import { play } from '../lib/sfx.js'
import { useApp } from '../stores/app.js'
import Markdown from './Markdown.vue'
import Icon from './Icon.vue'

const props = defineProps({
  open: Boolean,
  context: { type: String, default: '' },
})
const emit = defineEmits(['close'])
const app = useApp()

const messages = ref([])
const input = ref('')
const busy = ref(false)
const progress = ref(0)
const list = ref(null)
const inputEl = ref(null)
let ctrl = null

function scroll() {
  nextTick(() => list.value && (list.value.scrollTop = list.value.scrollHeight))
}

async function run(task, payload, userText) {
  if (busy.value) return
  if (userText) messages.value.push({ role: 'user', content: userText })
  busy.value = true
  progress.value = 0
  scroll()
  ctrl = new AbortController()
  try {
    const text = await ai(task, payload, { signal: ctrl.signal, onProgress: (p) => (progress.value = p.chars) })
    messages.value.push({ role: 'assistant', content: String(text) })
    play('blip')
  } catch (err) {
    if (err.name !== 'AbortError') messages.value.push({ role: 'assistant', content: `**Błąd:** ${err.message}`, error: true })
  } finally {
    busy.value = false
    scroll()
    nextTick(() => inputEl.value?.focus())
  }
}

function ask(question) {
  const q = (question ?? input.value).trim()
  if (!q) return
  input.value = ''
  const history = messages.value.filter((m) => !m.error)
  run('chat', { context: props.context, history, question: q }, q)
}

function explain(payload, label = 'Wyjaśnij krok po kroku') {
  run('explain', payload, label)
}

function reset() {
  ctrl?.abort()
  messages.value = []
  busy.value = false
}

watch(
  () => props.open,
  (o) => o && nextTick(() => inputEl.value?.focus()),
)

defineExpose({ ask, explain, reset })

const SUGGESTIONS = ['Daj prostszy przykład', 'Gdzie to się przydaje w praktyce?', 'Jakie są typowe pułapki?']
</script>

<template>
  <Transition name="drawer">
    <aside v-if="open" class="drawer" aria-label="Rozmowa z modelem">
      <header class="dh">
        <span class="dt"><Icon name="chat" :size="20" />Dopytaj {{ app.settings.provider === 'codex' ? 'Codex' : 'Claude' }}</span>
        <button class="close" aria-label="Zamknij" @click="emit('close')"><Icon name="x" :size="20" :stroke="2.6" /></button>
      </header>
      <div ref="list" class="msgs">
        <div v-if="!messages.length && !busy" class="empty">
          <p>Zapytaj o cokolwiek związanego z tym ćwiczeniem.</p>
          <button v-for="s in SUGGESTIONS" :key="s" class="chip" @click="ask(s)">{{ s }}</button>
        </div>
        <div v-for="(m, i) in messages" :key="i" class="msg" :class="m.role">
          <Markdown v-if="m.role === 'assistant'" :src="m.content" />
          <template v-else>{{ m.content }}</template>
        </div>
        <div v-if="busy" class="msg assistant thinking">
          <span class="spinner" />
          Myślę… <span class="muted mono">{{ progress }} zn</span>
        </div>
      </div>
      <form class="ask" @submit.prevent="ask()">
        <textarea
          ref="inputEl"
          v-model="input"
          rows="2"
          placeholder="Twoje pytanie…"
          :disabled="busy"
          @keydown.enter.exact.prevent="ask()"
        />
        <button class="btn btn-primary btn-sm" type="submit" :disabled="busy || !input.trim()" aria-label="Wyślij">
          <Icon name="send" :size="18" :stroke="2.6" />
        </button>
      </form>
    </aside>
  </Transition>
</template>

<style scoped>
.drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(480px, 100vw);
  background: var(--surface-2);
  border-left: 2px solid var(--border);
  z-index: 50;
  display: flex;
  flex-direction: column;
  box-shadow: -20px 0 40px rgba(0, 0, 0, 0.35);
}
.drawer-enter-active,
.drawer-leave-active {
  transition: transform 0.22s ease;
}
.drawer-enter-from,
.drawer-leave-to {
  transform: translateX(100%);
}
.dh {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 2px solid var(--divider);
}
.dt {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 900;
  font-size: 17px;
}
.close {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  padding: 6px;
  border-radius: 10px;
  display: grid;
}
.close:hover {
  background: var(--surface);
  color: var(--text);
}
.msgs {
  flex: 1;
  overflow-y: auto;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.empty {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
  color: var(--text-3);
  font-weight: 600;
}
.empty p {
  margin: 0 0 6px;
}
.empty .chip {
  font-size: 14px;
  padding: 8px 12px;
}
.msg {
  border-radius: 16px;
  padding: 12px 14px;
  font-size: 15px;
  line-height: 1.55;
  max-width: 100%;
}
.msg.user {
  align-self: flex-end;
  background: var(--purple-soft);
  color: var(--purple-light);
  border: 2px solid var(--purple);
  font-weight: 700;
  white-space: pre-wrap;
}
.msg.assistant {
  background: var(--surface);
  border: 2px solid var(--border);
  color: var(--text-2);
}
.thinking {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 700;
}
.mono {
  font-family: var(--mono);
  font-size: 12px;
}
.ask {
  display: flex;
  gap: 8px;
  padding: 14px;
  border-top: 2px solid var(--divider);
  align-items: flex-end;
}
.ask textarea {
  flex: 1;
  resize: none;
  background: var(--surface);
  border: 2px solid var(--border);
  border-radius: 14px;
  padding: 10px 12px;
  font-size: 15px;
  outline: none;
  line-height: 1.4;
}
.ask textarea:focus {
  border-color: var(--purple);
}
</style>
