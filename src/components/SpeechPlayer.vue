<script setup>
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import Icon from './Icon.vue'
import { getRecording, playRecording } from '../lib/speech.js'
import { speechChunks } from '../lib/speech-text.js'
import { useApp } from '../stores/app.js'

const props = defineProps({
  getText: { type: Function, required: true },
  voiceDesign: Object,
  label: { type: String, default: 'Przeczytaj' },
})
const app = useApp()
const design = computed(() => props.voiceDesign ?? app.settings.voiceDesign ?? null)
const audio = ref(null)
const recordingUrl = ref('')
const currentTime = ref(0)
const duration = ref(0)
const reading = ref(false)
const loading = ref(false)
const error = ref('')
const autoplay = ref(false)
let disposed = false

async function startPlayback() {
  try {
    await playRecording(audio.value)
  } catch (err) {
    if (err.name !== 'AbortError') error.value = 'Użyj przycisku odtwarzania w odtwarzaczu.'
  }
}

async function toggleReading() {
  error.value = ''
  if (recordingUrl.value) {
    if (audio.value.paused) await startPlayback()
    else audio.value.pause()
    return
  }
  autoplay.value = !autoplay.value
  if (loading.value) return

  loading.value = true
  try {
    const chunks = speechChunks(props.getText().filter(Boolean))
    if (!chunks.length) throw new Error('Brak tekstu do odczytania.')
    const recording = await getRecording(chunks, design.value)
    if (disposed) return
    recordingUrl.value = URL.createObjectURL(recording)
    await nextTick()
    if (!disposed && autoplay.value) await startPlayback()
  } catch (err) {
    if (!disposed) error.value = err.message
  } finally {
    autoplay.value = false
    loading.value = false
  }
}

function stopReading() {
  autoplay.value = false
  audio.value.pause()
  seek(0)
}

function seek(time) {
  audio.value.currentTime = time
  currentTime.value = time
}

function formatTime(time) {
  const seconds = Math.floor(time)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

onBeforeUnmount(() => {
  disposed = true
  audio.value?.pause()
  if (recordingUrl.value) URL.revokeObjectURL(recordingUrl.value)
})
</script>

<template>
  <div class="reader" @keydown.stop>
    <div class="heading">
      <slot />
      <button
        type="button"
        class="btn btn-ghost btn-sm"
        :title="loading ? (autoplay ? 'Anuluj odtwarzanie' : 'Odtwórz po wygenerowaniu') : undefined"
        @click="toggleReading"
        @keydown.enter.stop
      >
        <span v-if="loading" class="spinner speech-spinner" aria-hidden="true" />
        <Icon v-else name="volume" :size="18" />
        <span aria-live="polite">
          {{ loading ? (autoplay ? 'Generuję nagranie…' : 'Generuję w tle…') : reading ? 'Wstrzymaj' : label }}
        </span>
      </button>
    </div>
    <div v-if="recordingUrl" class="speech-player" @keydown.enter.stop>
      <audio
        ref="audio"
        :src="recordingUrl"
        hidden
        preload="metadata"
        @loadedmetadata="duration = $event.target.duration"
        @timeupdate="currentTime = $event.target.currentTime"
        @play="reading = true"
        @pause="reading = false"
        @ended="reading = false"
      />
      <button
        type="button"
        class="btn btn-ghost btn-sm player-button player-play"
        :aria-label="reading ? 'Wstrzymaj' : 'Odtwórz'"
        :title="reading ? 'Wstrzymaj' : 'Odtwórz'"
        @click="toggleReading"
      >
        <Icon :name="reading ? 'pause' : 'play'" :size="18" />
      </button>
      <button type="button" class="btn btn-ghost btn-sm player-button" aria-label="Zatrzymaj" title="Zatrzymaj" @click="stopReading">
        <Icon name="stop" :size="18" />
      </button>
      <input
        class="player-seek"
        type="range"
        min="0"
        :max="duration"
        step="0.1"
        :value="currentTime"
        :disabled="!duration"
        :style="{ '--played': `${duration ? (currentTime / duration) * 100 : 0}%` }"
        aria-label="Pozycja odtwarzania"
        :aria-valuetext="`${formatTime(currentTime)} z ${formatTime(duration)}`"
        @input="seek(Number($event.target.value))"
      />
      <span class="player-time">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>
    </div>
    <p v-if="error" class="speech-status" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.reader {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.heading button {
  margin-left: auto;
}
.speech-spinner {
  width: 18px;
  height: 18px;
  border-width: 2px;
}
.speech-player {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background: var(--bg-deep);
  border: 2px solid var(--border);
  border-radius: 14px;
}
.player-button {
  padding: 0;
  min-width: 38px;
  min-height: 38px;
}
.player-play {
  color: var(--purple-light);
  background: var(--purple-soft);
  border-color: var(--purple-ring);
}
.player-seek {
  flex: 1 1 72px;
  min-width: 0;
  height: 24px;
  margin: 0 3px;
  appearance: none;
  background: transparent;
  cursor: pointer;
}
.player-seek::-webkit-slider-runnable-track {
  height: 6px;
  border-radius: 999px;
  background: linear-gradient(to right, var(--purple-link) var(--played), var(--border) var(--played));
}
.player-seek::-moz-range-track {
  height: 6px;
  border-radius: 999px;
  background: linear-gradient(to right, var(--purple-link) var(--played), var(--border) var(--played));
}
.player-seek::-webkit-slider-thumb {
  appearance: none;
  width: 14px;
  height: 14px;
  margin-top: -4px;
  border-radius: 50%;
  background: var(--purple-light);
}
.player-seek::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border: 0;
  border-radius: 50%;
  background: var(--purple-light);
}
.player-time {
  color: var(--text-2);
  font: 12px var(--mono);
  white-space: nowrap;
}
.speech-status {
  margin: 0;
  color: var(--text-2);
  font-size: 14px;
}
</style>
