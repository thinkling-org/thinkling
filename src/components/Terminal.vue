<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { terminalUrl } from '../lib/sandbox.js'

const props = defineProps({ wsId: { type: String, required: true }, active: { type: Boolean, default: true } })
const el = ref(null)
const status = ref('connecting') // connecting | open | closed
let term = null
let fit = null
let sock = null
let ro = null

function send(obj) {
  if (sock?.readyState === 1) sock.send(JSON.stringify(obj))
}

function connect() {
  status.value = 'connecting'
  sock = new WebSocket(terminalUrl(props.wsId))
  sock.onopen = () => {
    status.value = 'open'
    doFit()
  }
  sock.onmessage = (e) => term.write(typeof e.data === 'string' ? e.data : '')
  sock.onclose = () => {
    status.value = 'closed'
    term?.write('\r\n\x1b[90m[sesja zakończona — kliknij „Połącz ponownie”]\x1b[0m\r\n')
  }
}

function doFit() {
  if (!fit || !el.value?.offsetParent) return
  try {
    fit.fit()
    send({ t: 'r', c: term.cols, r: term.rows })
  } catch {}
}

/** Wpisuje komendę do terminala (np. z przycisku "Uruchom testy w terminalu"). */
function run(cmd) {
  send({ t: 'i', d: cmd + '\r' })
  term?.focus()
}

onMounted(() => {
  term = new Terminal({
    fontFamily: "'JetBrains Mono Variable', 'JetBrains Mono', Consolas, monospace",
    fontSize: 14,
    lineHeight: 1.25,
    cursorBlink: true,
    scrollback: 5000,
    allowProposedApi: false,
    theme: {
      background: '#0B0D0F',
      foreground: '#D5DADE',
      cursor: '#B4A3FF',
      selectionBackground: '#3A3260',
      black: '#15181B',
      red: '#FF5A6E',
      green: '#3DDC84',
      yellow: '#FFC93C',
      blue: '#82AAFF',
      magenta: '#C4A7FF',
      cyan: '#89DDFF',
      white: '#D5DADE',
      brightBlack: '#6E777E',
      brightRed: '#FF9AA8',
      brightGreen: '#7CF2B0',
      brightYellow: '#FFD27A',
      brightBlue: '#93C5FD',
      brightMagenta: '#D3C9FF',
      brightCyan: '#A5F3FC',
      brightWhite: '#F2F4F5',
    },
  })
  fit = new FitAddon()
  term.loadAddon(fit)
  term.open(el.value)
  term.onData((d) => send({ t: 'i', d }))
  ro = new ResizeObserver(() => doFit())
  ro.observe(el.value)
  connect()
})

watch(
  () => props.active,
  (a) => a && setTimeout(() => (doFit(), term?.focus()), 30),
)

onBeforeUnmount(() => {
  ro?.disconnect()
  try {
    sock?.close()
  } catch {}
  term?.dispose()
})

defineExpose({ run })
</script>

<template>
  <div class="term-wrap">
    <div ref="el" class="term" />
    <button v-if="status === 'closed'" class="btn btn-sm reconnect" @click="term.clear(); connect()">Połącz ponownie</button>
  </div>
</template>

<style scoped>
.term-wrap {
  position: relative;
  height: 100%;
  background: #0b0d0f;
}
.term {
  position: absolute;
  inset: 6px 4px 4px 10px;
}
.reconnect {
  position: absolute;
  right: 12px;
  top: 10px;
}
.term :deep(.xterm-viewport) {
  scrollbar-width: thin;
  scrollbar-color: #2c3237 transparent;
}
</style>
