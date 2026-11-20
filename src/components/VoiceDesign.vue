<script setup>
import { computed, ref } from 'vue'
import { useApp } from '../stores/app.js'
import { putJSON } from '../lib/api.js'
import { DEFAULT_VOICE_DESIGN, normalizeVoiceDesign, VOICE_CONTROLS } from '../lib/voice-design.js'
import Icon from './Icon.vue'
import SpeechPlayer from './SpeechPlayer.vue'

const app = useApp()
const draft = ref({ ...DEFAULT_VOICE_DESIGN, ...app.settings.voiceDesign })
const phrase = ref('Każde wywołanie funkcji tworzy kontekst wykonania. Najpierw silnik przygotowuje deklaracje, a potem wykonuje kod linia po linii.')
const status = ref('')
const error = ref('')
const saving = ref(false)
const design = computed(() => normalizeVoiceDesign(draft.value))
const active = computed(() => {
  const saved = app.settings.voiceDesign
  return saved && JSON.stringify(normalizeVoiceDesign(saved)) === JSON.stringify(design.value)
})
const previewKey = computed(() => JSON.stringify([design.value, phrase.value.trim()]))

function randomize() {
  draft.value.seed = crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff
  status.value = ''
}

async function saveVoice(voiceDesign) {
  saving.value = true
  const previous = app.settings.voiceDesign
  app.settings.voiceDesign = voiceDesign
  status.value = ''
  error.value = ''
  try {
    await putJSON('/api/state', app.persisted())
    status.value = voiceDesign ? 'Projekt ustawiony jako głos lekcji.' : 'Przywrócono domyślny głos lekcji.'
  } catch {
    app.settings.voiceDesign = previous
    error.value = 'Nie udało się zapisać głosu.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="voice-design">
    <h2>Projektowanie głosu</h2>
    <div class="card design-card">
      <div class="voice-header">
        <div>
          <strong>Głos syntetyczny</strong>
          <p class="muted">Dobierz brzmienie, odsłuchaj próbkę i zapisz głos do lekcji.</p>
        </div>
        <button class="btn btn-ghost btn-sm" type="button" @click="randomize">
          <Icon name="refresh" :size="16" />Losuj głos
        </button>
      </div>

      <div class="voice-controls">
        <label v-for="control in VOICE_CONTROLS" :key="control.key" class="voice-control">
          <span class="control-name">
            <span>{{ control.label }}</span>
            <output>{{ draft[control.key].toLocaleString('pl') }}</output>
          </span>
          <input v-model.number="draft[control.key]" type="range" :min="control.min" :max="control.max" step="0.1" />
          <span class="control-ends"><span>{{ control.low }}</span><span>{{ control.high }}</span></span>
        </label>
      </div>

      <label class="preview-field">
        <span class="label">Tekst próbki</span>
        <textarea v-model="phrase" class="field" rows="3" maxlength="450" />
      </label>
      <SpeechPlayer
        v-if="phrase.trim()"
        :key="previewKey"
        :get-text="() => [phrase.trim()]"
        :voice-design="design"
        label="Odsłuchaj próbkę"
      />
      <div class="voice-actions">
        <button class="btn btn-primary btn-sm" type="button" :disabled="active || saving" @click="saveVoice(design)">
          {{ active ? 'Głos używany w lekcjach' : 'Ustaw w lekcjach' }}
        </button>
        <button v-if="app.settings.voiceDesign" class="btn btn-ghost btn-sm" type="button" :disabled="saving" @click="saveVoice(null)">
          Przywróć domyślny
        </button>
      </div>
      <p v-if="status" class="muted" role="status">{{ status }}</p>
      <p v-if="error" class="voice-error" role="alert">{{ error }}</p>
    </div>
  </section>
</template>

<style scoped>
.voice-design,
.design-card,
.preview-field {
  display: grid;
  gap: 12px;
}
.design-card {
  padding: 18px;
  gap: 18px;
}
.voice-design h2 {
  font-size: 20px;
}
.voice-header,
.voice-actions,
.control-name,
.control-ends {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}
.voice-header,
.voice-actions {
  flex-wrap: wrap;
  align-items: center;
}
.voice-header p,
.design-card > p {
  margin: 4px 0 0;
  font-size: 14px;
}
.voice-controls {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr));
  gap: 12px;
}
.voice-control {
  display: grid;
  gap: 7px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-deep);
  font-size: 14px;
}
.control-name {
  font-weight: 800;
}
.control-name output {
  color: var(--purple-light);
  font-family: var(--mono);
}
.control-ends {
  color: var(--text-2);
  font-size: 12px;
}
.voice-control input {
  width: 100%;
  margin: 0;
  accent-color: var(--purple);
}
.preview-field textarea {
  resize: vertical;
}
.voice-actions {
  justify-content: flex-start;
}
.voice-error {
  color: var(--red-light);
}
</style>
