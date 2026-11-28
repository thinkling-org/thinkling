<script setup lang="ts">
import { t } from '../lib/i18n.ts'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import Icon from './Icon.vue'
import { UiButton, UiSpinner } from './ui/index.ts'

type EditableField = HTMLInputElement | HTMLTextAreaElement
interface RecordingSession {
  field: EditableField
  initialValue: string
  start: number | null
  end: number | null
  abort: AbortController
  stream?: MediaStream
  recorder?: MediaRecorder
  meter?: AudioContext | null
  meterFrame?: number
  timer?: ReturnType<typeof setTimeout>
}

const route = useRoute()
const target = shallowRef<EditableField | null>(null)
const toolbar = ref(null)
const position = ref(null)
const dock = shallowRef(null)
const phase = ref('')
const message = ref('')
const BAR_COUNT = 30
const waveform = ref(Array(BAR_COUNT).fill(0))
let session: RecordingSession | null = null

const label = computed(() => ({
  requesting: t('Waiting for the microphone…'),
  recording: t('Stop dictation'),
  transcribing: t('Transcribing…'),
})[phase.value] || t('Dictate (Alt+Shift+M)'))

function editable(element) {
  return element?.matches?.('textarea, input:not([type]), input[type="text"], input[type="search"]')
    && !element.disabled && !element.readOnly && !element.closest('.monaco-editor')
}

function place() {
  const field = session?.field ?? target.value
  dock.value = field?.isConnected && field.hasAttribute('data-dictation-dock')
    ? field.closest('form')?.querySelector('[data-dictation-slot]')
    : null
  if (dock.value) {
    position.value = null
    return
  }
  if (!field?.isConnected) {
    position.value = null
    return
  }
  const rect = field.getBoundingClientRect()
  if (rect.bottom < 0 || rect.top >= window.innerHeight || !rect.width) {
    position.value = null
    return
  }
  const fitsOutside = rect.right + 50 <= window.innerWidth
  position.value = {
    left: `${Math.max(4, fitsOutside ? rect.right + 8 : rect.right - 42)}px`,
    top: `${Math.max(4, rect.top + (Math.min(rect.height, 48) - 36) / 2)}px`,
  }
}

function updateTarget(event) {
  if (toolbar.value?.contains(event.target)) return
  const field = editable(event.target) ? event.target : null
  if (target.value !== field) message.value = ''
  target.value = field
  place()
}

function releaseRecording(current: RecordingSession) {
  clearTimeout(current.timer)
  cancelAnimationFrame(current.meterFrame)
  current.meter?.close().catch(() => {})
  current.meter = null
  current.stream?.getTracks().forEach((track) => track.stop())
}

function prepareMeter(current: RecordingSession) {
  const AudioContext = window.AudioContext || window.webkitAudioContext
  if (!AudioContext) return
  try {
    current.meter = new AudioContext()
    current.meter.resume().catch(() => {})
  } catch {
    // Dictation still works when audio analysis is unavailable.
  }
}

function showWaveform(current: RecordingSession) {
  if (!current.meter) return
  const analyser = current.meter.createAnalyser()
  analyser.fftSize = 1024
  current.meter.createMediaStreamSource(current.stream).connect(analyser)
  const samples = new Float32Array(analyser.fftSize)
  let lastSample = 0
  const update = (now) => {
    if (session !== current || phase.value !== 'recording') return
    if (!current.field.isConnected) {
      cancel()
      return
    }
    if (now - lastSample >= 55) {
      analyser.getFloatTimeDomainData(samples)
      const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length)
      const level = Math.min(1, Math.max(0, (20 * Math.log10(rms) + 54) / 42))
      waveform.value = [...waveform.value.slice(1), level]
      lastSample = now
    }
    current.meterFrame = requestAnimationFrame(update)
  }
  current.meterFrame = requestAnimationFrame(update)
}

function cancel() {
  const current = session
  if (current) {
    session = null
    current.abort.abort()
    if (current.recorder?.state === 'recording') current.recorder.stop()
    releaseRecording(current)
  }
  phase.value = ''
  message.value = ''
  target.value = null
  place()
}

function insertTranscript(current, text) {
  const { field, initialValue, start, end } = current
  if (!field.isConnected || !editable(field)) return
  const changed = initialValue !== field.value
  const from = changed ? field.selectionStart : start
  const to = changed ? field.selectionEnd : end
  const left = field.value.slice(0, from)
  const right = field.value.slice(to)
  let addition = text
  if (/\S$/u.test(left) && !/[([{„“]$/u.test(left)) addition = ` ${addition}`
  if (/^\S/u.test(right) && !/^[.,;:!?%)\]}”»]/u.test(right)) addition += ' '
  if (field.maxLength >= 0) addition = addition.slice(0, Math.max(0, field.maxLength - left.length - right.length))
  if (!addition.trim()) return
  field.setRangeText(addition, from, to, 'end')
  field.dispatchEvent(new Event('input', { bubbles: true }))
}

async function transcribe(current, audio) {
  if (session !== current) return
  phase.value = 'transcribing'
  try {
    const response = await fetch('/api/dictation', {
      method: 'POST',
      headers: { 'Content-Type': audio.type },
      body: audio,
      signal: current.abort.signal,
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || t('Couldn\'t transcribe the recording.'))
    if (session !== current) return
    if (data.text?.trim()) insertTranscript(current, data.text.trim())
    else message.value = t('No speech detected.')
  } catch (error) {
    if (session === current) message.value = error.message
  } finally {
    if (session === current) {
      session = null
      phase.value = ''
      place()
    }
  }
}

async function toggle() {
  if (phase.value === 'recording') {
    session.recorder.stop()
    releaseRecording(session)
    phase.value = 'transcribing'
    return
  }
  if (phase.value || !editable(target.value)) return
  message.value = ''
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    message.value = t('This browser doesn\'t support microphone recording.')
    return
  }

  const field = target.value
  const current: RecordingSession = {
    field,
    initialValue: field.value,
    start: field.selectionStart,
    end: field.selectionEnd,
    abort: new AbortController(),
  }
  session = current
  phase.value = 'requesting'
  waveform.value = Array(BAR_COUNT).fill(0)
  prepareMeter(current)
  try {
    current.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    if (session !== current) {
      releaseRecording(current)
      return
    }
    const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4']
      .find((type) => MediaRecorder.isTypeSupported(type))
    const recorder = new MediaRecorder(current.stream, mimeType ? { mimeType } : undefined)
    current.recorder = recorder
    const chunks: Blob[] = []
    recorder.ondataavailable = ({ data }) => { if (data.size) chunks.push(data) }
    recorder.onstop = () => {
      releaseRecording(current)
      const audio = new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type })
      transcribe(current, audio)
    }
    recorder.onerror = () => {
      if (session !== current) return
      session = null
      phase.value = ''
      message.value = t('Recording was interrupted.')
      releaseRecording(current)
    }
    recorder.start()
    phase.value = 'recording'
    try {
      showWaveform(current)
    } catch {
      current.meter?.close().catch(() => {})
      current.meter = null
    }
    current.timer = setTimeout(() => {
      if (session === current && phase.value === 'recording') toggle()
    }, 60_000)
  } catch (error) {
    releaseRecording(current)
    if (session !== current) return
    session = null
    phase.value = ''
    message.value = error.name === 'NotAllowedError' ? t('Microphone access denied.') : t('Couldn\'t start the microphone.')
  }
}

function shortcut(event) {
  if (!event.altKey || !event.shiftKey || event.code !== 'KeyM' || event.repeat) return
  if (!target.value && editable(document.activeElement)) updateTarget({ target: document.activeElement })
  if (target.value || phase.value === 'recording') {
    event.preventDefault()
    toggle()
  }
}

watch(() => route.fullPath, cancel)
onMounted(() => {
  document.addEventListener('focusin', updateTarget)
  document.addEventListener('click', updateTarget, true)
  document.addEventListener('scroll', place, true)
  window.addEventListener('resize', place)
  window.addEventListener('keydown', shortcut)
  window.addEventListener('pagehide', cancel)
  updateTarget({ target: document.activeElement })
})
onBeforeUnmount(() => {
  document.removeEventListener('focusin', updateTarget)
  document.removeEventListener('click', updateTarget, true)
  document.removeEventListener('scroll', place, true)
  window.removeEventListener('resize', place)
  window.removeEventListener('keydown', shortcut)
  window.removeEventListener('pagehide', cancel)
  cancel()
})
</script>

<template>
  <Teleport :to="dock || 'body'">
    <div v-if="dock || position" ref="toolbar" class="dictation" :class="{ docked: dock }" :style="position">
      <UiButton
        variant="ghost"
        size="sm"
        class="microphone"
        :class="{ recording: phase === 'recording' }"
        :aria-label="label"
        :title="label"
        :disabled="phase === 'requesting' || phase === 'transcribing'"
        @mousedown.prevent
        @keydown.enter.stop
        @click="toggle"
      >
        <UiSpinner v-if="phase === 'transcribing' || phase === 'requesting'" />
        <Icon v-else :name="phase === 'recording' ? 'stop' : 'microphone'" :size="17" />
      </UiButton>
      <div v-if="phase === 'recording'" class="recording-meter" role="status">
        <span class="recording-label"><span aria-hidden="true" />{{ t('Recording') }}</span>
        <span class="waveform" aria-hidden="true">
          <span v-for="(level, index) in waveform" :key="index" :style="{ height: `${3 + level * 19}px` }" />
        </span>
      </div>
      <span v-if="message" class="notice" role="status">{{ message }}</span>
      <span v-else-if="phase !== 'recording'" class="sr-only" role="status">{{ phase ? label : '' }}</span>
    </div>
  </Teleport>
</template>

<style scoped>
.dictation {
  position: fixed;
  z-index: 1000;
}
.dictation.docked {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
}
.microphone {
  flex: none;
  width: 36px;
  min-height: 36px;
  padding: 0;
  background: var(--bg-deep);
  color: var(--purple-light);
}
.recording-meter {
  position: absolute;
  top: 0;
  right: calc(100% + 6px);
  display: flex;
  align-items: center;
  gap: 8px;
  width: 195px;
  min-height: 36px;
  padding: 0 8px;
  background: var(--bg-deep);
  border: 1px solid var(--border);
  border-radius: 9px;
  pointer-events: none;
}
.docked .recording-meter {
  position: static;
  flex: 1;
  min-width: 0;
  width: auto;
  padding: 0;
  border: 0;
  background: transparent;
}
.recording-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--red-light);
  font-size: 12px;
  font-weight: 800;
}
.recording-label > span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.waveform {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 1px;
  min-width: 0;
  height: 24px;
  overflow: hidden;
}
.waveform > span {
  flex: 1 0 1px;
  max-width: 3px;
  border-radius: 3px;
  background: var(--purple-link);
  transition: height 55ms linear;
}
.microphone.recording {
  color: var(--red-light);
  border-color: var(--red-light);
}
.notice {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  width: max-content;
  max-width: min(240px, 75vw);
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--bg-deep);
  color: var(--text);
  font-size: 13px;
}
.docked .notice {
  top: auto;
  bottom: calc(100% + 6px);
  right: auto;
  left: 0;
}
</style>
