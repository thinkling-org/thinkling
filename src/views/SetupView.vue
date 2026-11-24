<script setup lang="ts">
import { t } from '../lib/i18n.ts'
import { computed, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApp } from '../stores/app.ts'
import { useProviderSettings } from '../composables/useProviderSettings.ts'
import { useSetupJobs } from '../composables/useSetupJobs.ts'
import { AI_PROVIDERS, getAiProvider } from '../lib/ai-providers.ts'
import { DOCKER_SETUP_JOBS, SETUP_STEPS } from '../lib/setup-options.ts'
import CopyCommand from '../components/setup/CopyCommand.vue'
import ProviderConnectionTest from '../components/ProviderConnectionTest.vue'
import Logo from '../components/Logo.vue'
import Icon from '../components/Icon.vue'
import ModelPicker from '../components/ModelPicker.vue'
import JobLog from '../components/JobLog.vue'
import LanguagePicker from '../components/LanguagePicker.vue'

const app = useApp()
const router = useRouter()
const route = useRoute()

const { status, loading, startError, languages, anyRunning, recheck, startJob, job, running, toggleLang } = useSetupJobs()
const { chooseProvider, testConnection, testing, testResult } = useProviderSettings()
const step = shallowRef(Math.max(0, SETUP_STEPS.findIndex((item) => item.id === route.query.step)))
const current = computed(() => SETUP_STEPS[step.value].id)
const docker = computed(() => status.value?.docker)
const providers = computed(() => status.value?.providers || {})
const providerName = computed(() => getAiProvider(app.settings.provider).name)
const activeProvider = computed(() => providers.value[app.settings.provider])
const providerReady = computed(() => !!activeProvider.value?.available && activeProvider.value?.auth?.loggedIn !== false)

function next() {
  if (step.value < SETUP_STEPS.length - 1) step.value++
}
function back() {
  if (step.value > 0) step.value--
}
async function finish() {
  app.settings.setupDone = true
  await app.saveNow()
  await app.refreshStatus()
  router.push(app.plan ? '/path' : '/start')
}

const summary = computed(() => {
  const s = status.value
  if (!s) return []
  const p = activeProvider.value
  return [
    {
      label: t('AI provider: {0}{1}{2}', [providerName.value, app.settings.model ? ` · ${app.settings.model}` : '', app.settings.effort ? ` · ${app.settings.effort}` : '']),
      ok: providerReady.value,
      note: !p?.available ? t('CLI not installed') : p?.auth?.loggedIn === false ? t('signed out') : '',
    },
    { label: t('Docker (sandbox with terminal)'), ok: !!s.docker?.running, note: s.docker?.running ? '' : t('tasks in PHP, C++ and similar languages will be graded by the model') },
    { label: t('Dictation (Faster Whisper)'), ok: !!s.dictation?.installed, note: s.dictation?.installed ? '' : t('you can install it later from Settings') },
  ]
})
</script>

<template>
  <div class="page">
    <header class="head">
      <Logo />
      <span class="label">{{ t('Setup · step') }} {{ step + 1 }} / {{ SETUP_STEPS.length }}</span>
    </header>

    <main class="wrap">
      <div class="col">
        <nav class="dots" :aria-label="t('Setup steps')">
          <button
            v-for="(s, i) in SETUP_STEPS"
            :key="s.id"
            class="dot"
            :class="{ on: i === step, past: i < step }"
            :aria-current="i === step ? 'step' : undefined"
            @click="step = i"
          >
            <span class="n">{{ i < step ? '✓' : i + 1 }}</span>
            <span class="t">{{ t(s.title) }}</span>
          </button>
        </nav>

        <div v-if="!status && current !== 'welcome'" class="card box center">
          <span class="spinner" /> {{ t('Checking what\'s installed…') }}
        </div>

        <!-- Welcome -->
        <section v-else-if="current === 'welcome'" class="card box">
          <h1>{{ t('Welcome! Let\'s set up Codenoms') }}</h1>
          <LanguagePicker />
          <p class="lead">
            {{ t('Codenoms runs on your computer. The setup wizard checks the following and helps you install what\'s missing:') }}
          </p>
          <ul class="list">
            <li><strong>{{ t('AI provider') }}</strong>{{ t(': Claude Code or Codex, signed in with your subscription (required).') }}</li>
            <li><strong>Docker</strong>{{ t(': containerized environments with a terminal for PHP, C++, Python, Go and more (recommended).') }}</li>
            <li><strong>{{ t('Dictation') }}</strong>{{ t(': record spoken answers and transcribe them locally (optional, about 0.5 GB).') }}</li>
          </ul>
          <p class="muted">{{ t('You can skip steps and return to them later from Settings.') }}</p>
        </section>

        <!-- AI provider -->
        <section v-else-if="current === 'ai'" class="card box">
          <h1>{{ t('AI provider') }}</h1>
          <p class="lead">{{ t('Choose which CLI Codenoms uses. It runs through your subscription, without API token charges.') }}</p>
          <div class="providers">
            <button
              v-for="provider in AI_PROVIDERS"
              :key="provider.id"
              class="card prov"
              :class="{ on: app.settings.provider === provider.id }"
              :aria-pressed="app.settings.provider === provider.id"
              @click="chooseProvider(provider.id)"
            >
              <div class="ph">
                <strong>{{ provider.name }}</strong>
                <span v-if="!providers[provider.id]?.available" class="tag tag-red">{{ t('CLI missing') }}</span>
                <span v-else-if="providers[provider.id].auth?.loggedIn === false" class="tag tag-yellow">{{ t('signed out') }}</span>
                <span v-else class="tag tag-green">{{ t('ready') }}</span>
              </div>
              <span class="pd">{{ t(provider.subscription) }}</span>
              <code v-if="providers[provider.id]?.version" class="pv">{{ providers[provider.id].version }}</code>
            </button>
          </div>

          <div v-if="activeProvider && !activeProvider.available" class="hint">
            <strong>{{ t('Install') }} {{ providerName }}</strong> {{ t('in a terminal, then click “Check again”:') }}
            <CopyCommand :command="activeProvider.install" />
            <span class="muted small">{{ t('If the CLI is installed in an unusual location, set its path later in Settings.') }}</span>
          </div>
          <div v-else-if="activeProvider?.auth?.loggedIn === false" class="hint">
            <strong>{{ t('Sign in') }}</strong> {{ t('in a terminal (a browser will open), then click “Check again”:') }}
            <CopyCommand :command="activeProvider.login" />
          </div>

          <ModelPicker v-if="activeProvider?.available" :key="app.settings.provider" />

          <div class="row">
            <button class="btn btn-sm" :disabled="loading" @click="recheck"><Icon name="refresh" :size="16" /> {{ t('Check again') }}</button>
            <ProviderConnectionTest v-if="activeProvider?.available" :testing="testing" :result="testResult" @test="testConnection" />
          </div>
        </section>

        <!-- ------------------------------------------------------- Docker -->
        <section v-else-if="current === 'docker'" class="card box">
          <h1>Docker</h1>
          <p class="lead">
            {{ t('Docker runs PHP, C++, Python, Go, Rust, Java, C#, Ruby and SQL exercises in isolated containers with a terminal.') }}
          </p>

          <div class="statusline">
            <span class="tag" :class="docker.running ? 'tag-green' : 'tag-red'">
              {{ docker.running ? t('Docker is running · {0}{1}', [docker.version, docker.endpoint ? ` · ${t(docker.endpoint)}` : '']) : docker.problem === 'permission' ? t('permission denied') : docker.installed ? t('installed but not running') : t('not installed') }}
            </span>
          </div>

          <template v-if="!docker.running">
            <div v-if="docker.problem === 'permission'" class="hint">
              <strong>{{ t('Docker is running, but your account can\'t access it.') }}</strong> {{ t('Run this in a terminal:') }}
              <CopyCommand v-for="command in docker.help.permission" :key="command" :command="command" />
              <p v-if="docker.help.permissionHint" class="muted">{{ t(docker.help.permissionHint) }}</p>
            </div>
            <div v-else-if="!docker.installed" class="hint">
              <strong>{{ t('Install Docker.') }}</strong>
              <template v-if="docker.help.autoInstall">
                {{ t('Codenoms can install it for you. Your system will request an administrator password.') }}
                <button class="btn btn-primary btn-sm self" :disabled="anyRunning" @click="startJob('docker-install')">{{ t('Install Docker') }}</button>
                <span class="muted small">{{ t('Or manually, in a terminal:') }}</span>
              </template>
              <template v-else>{{ t('Run this in a terminal:') }}</template>
              <CopyCommand v-for="command in docker.help.install" :key="command" :command="command" />
              <a class="link small" :href="docker.help.link" target="_blank" rel="noopener">{{ t('Official installation guide ↗') }}</a>
            </div>
            <div v-else class="hint">
              <strong>{{ t('Start Docker.') }}</strong>
              <button v-if="docker.help.autoStart" class="btn btn-primary btn-sm self" :disabled="anyRunning" @click="startJob('docker-start')">{{ t('Start Docker') }}</button>
              <CopyCommand v-for="command in docker.help.start" :key="command" :command="command" />
              <p v-if="docker.help.startHint" class="muted">{{ t(docker.help.startHint) }}</p>
            </div>
          </template>

          <JobLog v-for="k in DOCKER_SETUP_JOBS" :key="k" :job="job(k)" />

          <template v-if="docker.running && status.sandbox">
            <span class="label">{{ t('Prepare environments in advance (optional)') }}</span>
            <span class="muted small">{{ t('Otherwise each language image builds during its first lesson, which takes 1–3 minutes.') }}</span>
            <div class="seg">
              <button
                v-for="(env, l) in status.sandbox"
                :key="l"
                class="chip"
                :class="{ ready: env.ready }"
                :aria-pressed="!env.ready && languages.includes(l)"
                :disabled="env.ready || running('sandbox')"
                @click="toggleLang(l)"
              >{{ env.label }}{{ env.ready ? ' ✓' : '' }}</button>
            </div>
            <button
              class="btn btn-sm self"
              :disabled="!languages.length || running('sandbox')"
              @click="startJob('sandbox', { languages })"
            >{{ t('Download selected (') }}{{ languages.length }})</button>
            <JobLog :job="job('sandbox')" />
          </template>

          <div class="row">
            <button class="btn btn-sm" :disabled="loading" @click="recheck"><Icon name="refresh" :size="16" /> {{ t('Check again') }}</button>
          </div>
        </section>

        <!-- Dictation -->
        <section v-else-if="current === 'dictation'" class="card box">
          <h1>{{ t('Dictation') }}</h1>
          <p class="lead">
            {{ t('Prefer speaking to typing? Use dictation to answer open questions aloud (the microphone next to the field or') }} <kbd>Alt+Shift+M</kbd>{{ t('). Speech is recognized locally by') }} <strong>Faster Whisper</strong>.
          </p>
          <ul class="list small">
            <li>{{ t('Download size: about') }} {{ status.dictation.downloadMB }} {{ t('MB (the small model and Python libraries).') }}</li>
            <li>
              {{ t('Requires Python 3.10–3.13:') }}
              <span v-if="status.dictation.python && status.dictation.pythonTested" class="ok-text">{{ t('found') }} {{ status.dictation.python }}</span>
              <span v-else-if="status.dictation.python" class="warn-text">{{ t('found') }} {{ status.dictation.python }}{{ t(': newer than tested. Installation may fail. Install Python 3.12 or 3.13 if needed.') }}</span>
              <span v-else class="bad-text">{{ t('not found. Get it from') }} <a class="link" href="https://www.python.org/downloads/" target="_blank" rel="noopener">python.org</a></span>
            </li>
          </ul>
          <div class="statusline">
            <span class="tag" :class="status.dictation.installed ? 'tag-green' : 'tag-yellow'">{{ status.dictation.installed ? t('Dictation ready') : t('Not installed') }}</span>
          </div>
          <div class="row">
            <button
              v-if="!status.dictation.installed"
              class="btn btn-primary"
              :disabled="!status.dictation.python || running('dictation')"
              @click="startJob('dictation')"
            >
              <span v-if="running('dictation')" class="spinner sm" />
              {{ running('dictation') ? t('Installing…') : job('dictation')?.status === 'error' ? t('Try again') : t('Install dictation') }}
            </button>
            <button v-if="!status.dictation.installed && !running('dictation')" class="btn" @click="next">{{ t('Not now') }}</button>
          </div>
          <JobLog :job="job('dictation')" />
        </section>

        <!-- ------------------------------------------------------- complete -->
        <section v-else class="card box">
          <h1>{{ t('You\'re ready') }}</h1>
          <ul class="summary">
            <li v-for="s in summary" :key="s.label">
              <Icon :name="s.ok ? 'check' : 'x'" :size="18" :stroke="3" :class="s.ok ? 'ok-text' : 'bad-text'" />
              <span>{{ s.label }}<span v-if="s.note" class="muted"> · {{ s.note }}</span></span>
            </li>
          </ul>
          <div v-if="anyRunning" class="hint">{{ t('Installation is still running in the background. You can start learning now and use the feature once it finishes.') }}</div>
          <div v-if="!providerReady" class="hint warn">{{ t('Codenoms needs a working AI provider to create a plan or lessons. Return to “AI provider”.') }}</div>
        </section>

        <p v-if="startError" class="tr bad">{{ startError }}</p>

        <footer v-if="status || current === 'welcome'" class="nav">
          <button v-if="step > 0" class="btn" @click="back"><Icon name="arrow-left" :size="18" /> {{ t('Back') }}</button>
          <span class="grow" />
          <button v-if="current !== 'done'" class="btn btn-primary" @click="next">
            {{ current === 'welcome' ? t('Get started') : t('Continue') }} <Icon name="arrow-right" :size="18" />
          </button>
          <button v-else class="btn btn-green btn-lg" :disabled="!providerReady" @click="finish">{{ t('Continue to learning') }}</button>
        </footer>
      </div>
    </main>
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.head {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  padding: 20px 32px;
  border-bottom: 2px solid var(--divider);
}
.wrap {
  flex: 1;
  display: flex;
  justify-content: center;
  padding: 36px 16px 48px;
}
.col {
  width: 100%;
  max-width: 780px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.dots {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.dot {
  display: flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: 0;
  color: var(--faint);
  font: inherit;
  font-weight: 800;
  font-size: 14px;
  cursor: pointer;
  padding: 6px 10px 6px 6px;
  border-radius: 999px;
}
.dot .n {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  border: 2px solid var(--border);
  font-size: 13px;
}
.dot.past {
  color: var(--text-3);
}
.dot.past .n {
  background: var(--green-soft);
  border-color: var(--green-border);
  color: var(--green-light);
}
.dot.on {
  color: var(--text);
  background: var(--surface);
}
.dot.on .n {
  border-color: var(--purple);
  background: var(--purple-soft);
  color: var(--purple-light);
}
.box {
  padding: 28px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.box.center {
  flex-direction: row;
  align-items: center;
  font-weight: 700;
}
h1 {
  font-size: 28px;
  margin: 0;
}
.lead {
  margin: 0;
  line-height: 1.55;
  font-weight: 600;
  color: var(--text-2);
}
.list {
  margin: 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  line-height: 1.5;
  color: var(--text-2);
}
.providers {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.prov {
  padding: 16px;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 6px;
  cursor: pointer;
  min-width: 0;
  font: inherit;
  color: inherit;
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
  font-size: 17px;
}
.pd {
  color: var(--text-3);
  font-weight: 600;
  font-size: 14px;
}
.pv {
  font-size: 12px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hint {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 14px;
  background: var(--surface-2);
  border: 2px solid var(--border);
  line-height: 1.5;
  font-weight: 600;
}
.hint.warn {
  background: var(--yellow-bg);
  border-color: var(--yellow-border);
  color: var(--yellow-light);
}
.self {
  align-self: flex-start;
}
.seg {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.row {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.chip.ready,
.chip.ready:disabled {
  background: var(--green-soft);
  border-color: var(--green-border);
  color: var(--green-light);
  opacity: 1;
}
.statusline {
  display: flex;
  gap: 8px;
}
.small {
  font-size: 13px;
  font-weight: 700;
}
.link {
  color: var(--purple-link);
}
.spinner.sm {
  width: 16px;
  height: 16px;
  border-width: 2px;
}
.tr {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  margin: 0;
}
.ok-text {
  color: var(--green-light);
}
.warn-text {
  color: var(--yellow-light);
}
.tr.bad,
.bad-text {
  color: var(--red-light);
}
.tr.bad {
  font-family: var(--mono);
  font-size: 13px;
  white-space: pre-wrap;
}
.summary {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-weight: 700;
}
.summary li {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.nav {
  display: flex;
  align-items: center;
  gap: 10px;
}
.grow {
  flex: 1;
}
kbd {
  font-family: var(--mono);
  font-size: 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 1px 6px;
}
@media (max-width: 640px) {
  .providers {
    grid-template-columns: 1fr;
  }
  .head {
    padding: 16px;
  }
  .box {
    padding: 20px 16px;
  }
  .dot .t {
    display: none;
  }
}
</style>
