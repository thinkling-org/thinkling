<script setup lang="ts">
import { t } from '../lib/i18n.ts'
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useApp } from '../stores/app.ts'
import { useProviderSettings } from '../composables/useProviderSettings.ts'
import { AI_PROVIDERS, getAiProvider } from '../lib/ai-providers.ts'
import ProviderConnectionTest from '../components/ProviderConnectionTest.vue'
import AppShell from '../components/AppShell.vue'
import ModelPicker from '../components/ModelPicker.vue'
import LanguagePicker from '../components/LanguagePicker.vue'
import DesktopUpdate from '../components/DesktopUpdate.vue'
import { play } from '../lib/sfx.ts'
import { SOUND_PREVIEWS, playSoundPreview } from '../lib/sound-previews.ts'
import { UiButton, UiChoiceGroup, UiInput, UiTag } from '../components/ui/index.ts'

const app = useApp()
const router = useRouter()

const { chooseProvider, testConnection, testing, testResult } = useProviderSettings()
const provider = computed(() => getAiProvider(app.settings.provider))

function setSound(on: boolean) {
  app.settings.sound = on
  if (on) play('correct')
}

function runSetup() {
  router.push('/setup')
}

async function saveBins() {
  await app.saveNow()
  await app.refreshStatus()
}

function newPlan() {
  router.push('/start')
}
function resetAll() {
  if (!confirm(t('Delete your plan, progress, XP, streak and flashcards? This can\'t be undone.'))) return
  app.resetAll()
  router.push('/start')
}
</script>

<template>
  <AppShell>
    <div class="content">
      <h1>{{ t('Settings') }}</h1>

      <section class="sec">
        <LanguagePicker explain />
      </section>

      <section class="sec">
        <h2>{{ t('AI provider') }}</h2>
        <p class="muted">{{ t('Thinkling runs a local CLI that uses your subscription. You don\'t pay for API tokens.') }}</p>
        <div class="providers">
          <button
            v-for="p in AI_PROVIDERS"
            :key="p.id"
            class="card prov"
            :class="{ on: app.settings.provider === p.id }"
            :aria-pressed="app.settings.provider === p.id"
            @click="chooseProvider(p.id)"
          >
            <div class="ph">
              <strong>{{ p.name }}</strong>
              <UiTag
                :tone="app.status?.providers?.[p.id]?.available ? 'green' : 'red'"
              >{{ app.status ? (app.status.providers?.[p.id]?.available ? t('found') : t('missing')) : '…' }}</UiTag>
            </div>
            <span class="pd">{{ t(p.description) }}</span>
            <code v-if="app.status?.providers?.[p.id]?.version" class="pv">{{ app.status.providers[p.id].version }}</code>
            <code v-if="app.status?.providers?.[p.id]?.path" class="pp" :title="app.status.providers[p.id].path">{{ app.status.providers[p.id].path }}</code>
          </button>
        </div>
      </section>

      <section class="sec">
        <h2>{{ t('Model and reasoning effort —') }} {{ provider.name }}</h2>
        <ModelPicker />
        <div class="row">
          <ProviderConnectionTest :testing="testing" :result="testResult" @test="testConnection" />
        </div>
      </section>

      <section class="sec">
        <h2>{{ t('Runtime') }}</h2>
        <div class="card dk">
          <div class="ph">
            <strong>Docker</strong>
            <UiTag :tone="app.docker?.available ? 'green' : 'red'">
              {{ app.docker ? (app.docker.available ? t('running · {0}', [app.docker.version]) : t('not running')) : '…' }}
            </UiTag>
          </div>
          <span class="pd">
            {{ t('Exercises in PHP, C++, Python, Go, Rust, Java, C# and SQL run in real containers with files, a Bash terminal and tests. Containers have no network access and have a memory limit. A language image builds on first use.') }}
          </span>
          <span v-if="app.docker && !app.docker.available" class="pd warn">
            {{ app.docker.error || t('Docker isn\'t responding.') }} {{ t('Without Docker, these exercises are graded only by') }} {{ provider.shortName }}.
          </span>
          <UiButton size="sm" style="align-self: flex-start" @click="app.refreshStatus()">{{ t('Check again') }}</UiButton>
        </div>
        <span id="js-runtime-label" class="label">JavaScript / TypeScript</span>
        <UiChoiceGroup
          :model-value="app.settings.jsRuntime === 'docker' ? 'docker' : 'browser'"
          :options="[
            { value: 'browser', label: t('In the browser — fast') },
            { value: 'docker', label: t('In a container — Node and terminal'), disabled: !app.docker?.available },
          ]"
          labelledby="js-runtime-label"
          @update:model-value="(runtime) => { app.settings.jsRuntime = runtime }"
        />
        <span class="muted small">{{ t('Applies to newly generated lessons.') }}</span>
      </section>

      <section class="sec">
        <h2>{{ t('Sound') }}</h2>
        <div class="row">
          <UiChoiceGroup
            :model-value="app.settings.sound !== false"
            :options="[{ value: true, label: t('On') }, { value: false, label: t('Off') }]"
            :label="t('Sound')"
            @update:model-value="setSound"
          />
          <label class="vol" :class="{ off: app.settings.sound === false }">
            <span class="label">{{ t('Volume') }}</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              :value="app.settings.volume ?? 0.6"
              :disabled="app.settings.sound === false"
              @input="app.settings.volume = Number(($event.target as HTMLInputElement).value)"
              @change="play('pop')"
            />
          </label>
        </div>
        <div v-if="app.settings.sound !== false" class="row">
          <span class="label">{{ t('Preview:') }}</span>
          <UiButton v-for="sound in SOUND_PREVIEWS" :key="sound.id" size="sm" @click="playSoundPreview(sound.id)">{{ t(sound.label) }}</UiButton>
        </div>
      </section>

      <section class="sec">
        <h2>{{ t('CLI paths (optional)') }}</h2>
        <p class="muted">{{ t('Leave these empty for automatic detection via PATH, ~/.local/bin, VS Code/Cursor extensions, or the Codex installation.') }}</p>
        <label class="label" for="cbin">Claude</label>
        <UiInput id="cbin" v-model="app.settings.claudeBin" class="mono" :placeholder="t('e.g. C:\\Users\\…\\claude.exe')" @change="saveBins" />
        <label class="label" for="xbin">Codex</label>
        <UiInput id="xbin" v-model="app.settings.codexBin" class="mono" :placeholder="t('e.g. C:\\Users\\…\\codex.exe')" @change="saveBins" />
      </section>

      <section class="sec danger">
        <h2>{{ t('Data') }}</h2>
        <p class="muted">{{ t('Everything is stored locally in') }} <code>data/db.json</code> {{ t('in the project directory.') }}</p>
        <div class="row">
          <UiButton size="sm" @click="runSetup()">{{ t('Setup wizard') }}</UiButton>
          <UiButton size="sm" @click="newPlan">{{ t('Create a new plan') }}</UiButton>
          <UiButton variant="ghost-red" size="sm" @click="resetAll">{{ t('Clear all data') }}</UiButton>
        </div>
      </section>
      <DesktopUpdate />
    </div>
  </AppShell>
</template>

<style scoped>
.content {
  padding: 28px 32px 60px;
  max-width: 900px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 28px;
}
h1 {
  font-size: 32px;
}
h2 {
  font-size: 20px;
}
.sec {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sec p {
  margin: 0;
  line-height: 1.5;
  font-weight: 600;
}
.providers {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.prov {
  padding: 18px;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: pointer;
  min-width: 0;
}
.prov.on {
  border-color: var(--purple);
  background: var(--purple-soft);
}
.ph {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  font-size: 18px;
}
.pd {
  color: var(--text-3);
  font-weight: 600;
  font-size: 14px;
  line-height: 1.5;
}
.pv,
.pp {
  font-size: 12px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.inline {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.row {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.row .input {
  flex: 1;
  min-width: 200px;
}
.mono {
  font-family: var(--mono);
  font-size: 13px;
}
.dk {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pd.warn {
  color: var(--yellow-light);
}
.small {
  font-size: 13px;
  font-weight: 700;
}
.vol {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: 8px;
}
.vol.off {
  opacity: 0.4;
}
.vol input {
  width: 160px;
  accent-color: var(--purple);
}
@media (max-width: 760px) {
  .providers {
    grid-template-columns: 1fr;
  }
  .content {
    padding: 20px 16px 40px;
  }
}
</style>
