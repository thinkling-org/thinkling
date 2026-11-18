<script setup>
import { watchEffect } from 'vue'
import { useApp } from './stores/app.js'
import { configureSfx } from './lib/sfx.js'

const app = useApp()
watchEffect(() => configureSfx({ sound: app.settings.sound !== false, volume: app.settings.volume ?? 0.6 }))
</script>

<template>
  <RouterView :key="$route.fullPath" />
</template>
