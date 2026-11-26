<script setup lang="ts">
import { onUnmounted, watchEffect } from 'vue'
import { useApp } from './stores/app.ts'
import Dictation from './components/Dictation.vue'
import GlossaryPopover from './components/GlossaryPopover.vue'
import { configureSfx } from './lib/sfx.ts'
import { useDesktopUpdates } from './stores/updates.ts'
import UpdatePrompt from './components/UpdatePrompt.vue'

const app = useApp()
const disconnectUpdates = useDesktopUpdates().connect()
onUnmounted(disconnectUpdates)
watchEffect(() => configureSfx({ sound: app.settings.sound !== false, volume: app.settings.volume ?? 0.6 }), { flush: 'sync' })
</script>

<template>
  <RouterView :key="$route.fullPath" />
  <Dictation v-if="app.status?.features?.dictation !== false" />
  <GlossaryPopover />
  <UpdatePrompt />
</template>
