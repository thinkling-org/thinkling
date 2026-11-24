<script setup lang="ts">
import { t } from '../lib/i18n.ts'
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ai } from '../lib/api.ts'
import { play } from '../lib/sfx.ts'
import { useApp } from '../stores/app.ts'
import Markdown from './Markdown.vue'
import Icon from './Icon.vue'

const props = defineProps({
  open: Boolean,
  context: { type: String, default: '' },
})
const emit = defineEmits(['close'])
const app = useApp()

const messages = ref<{ role: 'user' | 'assistant'; content: string; error?: boolean }[]>([])
const input = ref('')
const busy = ref(false)
const progress = ref(0)
const list = ref<HTMLDivElement | null>(null)
const inputEl = ref<HTMLTextAreaElement | null>(null)
let ctrl: AbortController | null = null

function scroll() {
  nextTick(() => list.value && (list.value.scrollTop = list.value.scrollHeight))
}

async function run(task: 'chat' | 'explain', payload: unknown, userText: string) {
  if (busy.value) return
  if (userText) messages.value.push({ role: 'user', content: userText })
  busy.value = true
  progress.value = 0
  scroll()
  const request = new AbortController()
  ctrl = request
  try {
    const text = await ai(task, payload, {
      signal: request.signal,
      onProgress: (p) => {
        if (ctrl === request) progress.value = p.chars
      },
    })
    if (ctrl !== request) return
    messages.value.push({ role: 'assistant', content: String(text) })
    play('blip')
  } catch (err) {
    if (ctrl === request && err.name !== 'AbortError') {
      messages.value.push({ role: 'assistant', content: t('**Error:** {0}', [err.message]), error: true })
    }
  } finally {
    if (ctrl === request) {
      ctrl = null
      busy.value = false
      scroll()
      nextTick(() => {
        if (props.open) inputEl.value?.focus()
      })
    }
  }
}

function ask(question?: string) {
  const q = (question ?? input.value).trim()
  if (!q) return
  input.value = ''
  const history = messages.value.filter((m) => !m.error)
  run('chat', { context: props.context, history, question: q }, q)
}

function explain(payload, label = t('Explain step by step')) {
  run('explain', payload, label)
}

function reset() {
  ctrl?.abort()
  ctrl = null
  messages.value = []
  input.value = ''
  progress.value = 0
  busy.value = false
}

watch(
  () => props.open,
  (o) => o && nextTick(() => inputEl.value?.focus()),
)

onBeforeUnmount(reset)
defineExpose({ explain, reset })

const SUGGESTIONS = [t('Give me a simpler example'), t('Where is this useful in practice?'), t('What are the common pitfalls?')]
</script>

<template>
  <Transition name="drawer">
    <aside v-if="open" class="drawer" :aria-label="t('Chat with the tutor')">
      <header class="dh">
        <span class="dt"><Icon name="chat" :size="20" />{{ t('Ask a follow-up') }} {{ app.settings.provider === 'codex' ? 'Codex' : 'Claude' }}</span>
        <button class="close" :aria-label="t('Close')" @click="emit('close')"><Icon name="x" :size="20" :stroke="2.6" /></button>
      </header>
      <div ref="list" class="msgs">
        <div v-if="!messages.length && !busy" class="empty">
          <p>{{ t('Ask anything about this exercise.') }}</p>
          <button v-for="s in SUGGESTIONS" :key="s" class="chip" @click="ask(s)">{{ s }}</button>
        </div>
        <div v-for="(m, i) in messages" :key="i" class="msg" :class="m.role">
          <Markdown v-if="m.role === 'assistant'" :src="m.content" />
          <template v-else>{{ m.content }}</template>
        </div>
        <div v-if="busy" class="msg assistant thinking">
          <span class="spinner" />
          {{ t('Thinking…') }} <span class="muted mono">{{ progress }} {{ t('chars') }}</span>
        </div>
      </div>
      <form class="ask" @submit.prevent="ask()">
        <textarea
          ref="inputEl"
          v-model="input"
          rows="2"
          :placeholder="t('Your question…')"
          :aria-label="t('Your question')"
          data-dictation-dock
          :disabled="busy"
          @keydown.enter.exact.prevent="ask()"
        />
        <div class="ask-actions">
          <div class="mic-slot" data-dictation-slot />
          <button class="btn btn-primary btn-sm send" type="submit" :disabled="busy || !input.trim()">
            <Icon name="send" :size="17" :stroke="2.6" />{{ t('Send') }}
          </button>
        </div>
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
@media (min-width: 1100px) {
  .drawer {
    width: var(--ask-width);
    box-shadow: none;
  }
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
  display: grid;
  gap: 6px;
  margin: 12px 16px 16px;
  padding: 8px;
  background: var(--bg-deep);
  border: 2px solid var(--border);
  border-radius: 16px;
}
.ask:focus-within {
  border-color: var(--purple);
}
.ask textarea {
  width: 100%;
  min-width: 0;
  resize: none;
  background: transparent;
  border: none;
  padding: 6px 7px;
  font-size: 15px;
  outline: none;
  line-height: 1.4;
}
.ask-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.mic-slot {
  flex: 1;
  min-width: 36px;
  min-height: 36px;
}
.send {
  min-height: 36px;
}
</style>
