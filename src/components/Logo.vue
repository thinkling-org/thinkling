<script setup lang="ts">
import { t } from '../lib/i18n.ts'
import { useId } from 'vue'

// Give each instance a unique SVG mask ID.
const maskId = `logo-mask-${useId()}`
</script>

<template>
  <RouterLink to="/" class="logo" :aria-label="t('Thinkling home')">
    <!-- Flat hexagonal mark with cutouts for the eyes. -->
    <svg aria-hidden="true" width="36" height="36" viewBox="0 0 120 120">
      <defs>
        <mask :id="maskId" maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="120">
          <rect width="120" height="120" fill="#000" />
          <polygon points="60,14 100,37 100,83 60,106 20,83 20,37" fill="#fff" stroke="#fff" stroke-width="12" stroke-linejoin="round" />
          <rect x="40" y="50" width="13" height="22" rx="6.5" fill="#000" />
          <rect x="67" y="50" width="13" height="22" rx="6.5" fill="#000" />
        </mask>
      </defs>
      <rect width="120" height="120" fill="#7C5CFF" :mask="`url(#${maskId})`" />
    </svg>
    <span class="wordmark"><span class="think">think</span><span class="ling">ling</span></span>
  </RouterLink>
</template>

<style scoped>
.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text);
  text-decoration: none;
  font-size: 22px;
}
.logo:hover {
  color: var(--text);
}
/* Distinguish the two parts of the wordmark with a typeface and weight change. */
.wordmark {
  letter-spacing: -0.01em;
  white-space: nowrap;
}
.think {
  font-family: var(--mono);
  font-weight: 500;
}
.ling {
  font-weight: 900;
}
</style>
