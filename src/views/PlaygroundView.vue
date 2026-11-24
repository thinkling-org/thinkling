<script setup lang="ts">
import { t } from '../lib/i18n.ts'
import { computed, onMounted, shallowRef } from 'vue'
import { useApp } from '../stores/app.ts'
import { DEFAULT_SANDBOX_LANGUAGE, getSandboxStarter, hasSandboxStarter } from '../lib/sandbox-starters.ts'
import AppShell from '../components/AppShell.vue'
import SandboxIDE from '../components/SandboxIDE.vue'

const app = useApp()

const langs = computed(() => Object.entries(app.docker?.envs || {}).filter(([id]) => hasSandboxStarter(id)))
const planLanguage = String(app.plan?.language || '').toLowerCase()
const lang = shallowRef(hasSandboxStarter(planLanguage) ? planLanguage : DEFAULT_SANDBOX_LANGUAGE)
const starter = computed(() => getSandboxStarter(lang.value))

onMounted(() => {
  if (!app.docker) app.refreshStatus()
})
</script>

<template>
  <AppShell>
    <div class="pg">
      <div class="pg-head">
        <h1>{{ t('Sandbox') }}</h1>
        <div class="seg">
          <button v-for="[k, label] in langs" :key="k" class="chip" :aria-pressed="lang === k" @click="lang = k">{{ label }}</button>
        </div>
      </div>
      <div v-if="app.docker && !app.docker.available" class="card off">
        <strong>{{ t('Docker isn\'t running.') }}</strong> {{ t('Start Docker Desktop and click') }}
        <button class="link-btn" @click="app.refreshStatus()">{{ t('check again') }}</button>.
      </div>
      <SandboxIDE
        v-else-if="app.docker"
        :key="lang"
        class="ide"
        :ws-id="`play-${lang}`"
        :language="lang"
        :seed-files="starter.files"
        :test-command="starter.run"
        :main-file="starter.mainFile"
        :run-label="t('Run')"
      />
    </div>
  </AppShell>
</template>

<style scoped>
.pg {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 14px;
  padding: 20px 28px 24px;
  height: calc(100vh - 72px);
  min-height: 560px;
}
.pg-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  align-content: flex-start;
  gap: 16px;
}
h1 {
  font-size: 26px;
}
.seg {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.seg .chip {
  padding: 6px 12px;
  font-size: 13px;
}
.ide {
  min-height: 0;
  height: 100%;
}
.off {
  padding: 20px;
}
@media (max-width: 860px) {
  .pg {
    padding: 14px;
    height: auto;
  }
  .ide {
    height: 80vh;
  }
}
</style>
