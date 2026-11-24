<script setup lang="ts">
import { watchEffect } from 'vue'
import { useApp } from './stores/app.ts'
import Dictation from './components/Dictation.vue'
import GlossaryPopover from './components/GlossaryPopover.vue'
import { configureSfx } from './lib/sfx.ts'

const app = useApp()
watchEffect(() => configureSfx({ sound: app.settings.sound !== false, volume: app.settings.volume ?? 0.6 }), { flush: 'sync' })
</script>

<template>
  <RouterView :key="$route.fullPath" />
  <Dictation v-if="app.status?.features?.dictation !== false" />
  <GlossaryPopover />
</template>
