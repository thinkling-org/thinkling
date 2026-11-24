<script setup>
import { t } from '../lib/i18n.js'
import { useId } from 'vue'

// Give each instance a unique SVG mask ID.
const maskId = `logo-mask-${useId()}`
</script>

<template>
  <RouterLink to="/" class="logo" :aria-label="t('Codenoms home')">
    <!-- Hexagonal mark with a bitten corner and cutouts for the eyes. -->
    <svg aria-hidden="true" width="36" height="36" viewBox="0 0 120 120">
      <defs>
        <mask :id="maskId" maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="120">
          <rect width="120" height="120" fill="#000" />
          <polygon points="60,14 100,37 100,83 60,106 20,83 20,37" fill="#fff" stroke="#fff" stroke-width="14" stroke-linejoin="round" />
          <circle cx="107" cy="44" r="13" fill="#000" />
          <circle cx="99" cy="25" r="10" fill="#000" />
          <rect x="38" y="50" width="13" height="22" rx="6.5" fill="#000" />
          <rect x="63" y="50" width="13" height="22" rx="6.5" fill="#000" />
        </mask>
      </defs>
      <rect width="120" height="120" fill="#7C5CFF" :mask="`url(#${maskId})`" />
    </svg>
    <span class="wordmark"><span class="code">code</span><span class="noms">noms</span></span>
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
/* Distinguish the two parts of the wordmark with a typeface and color change. */
.wordmark {
  letter-spacing: -0.01em;
  white-space: nowrap;
}
.code {
  font-family: var(--mono);
  font-weight: 500;
}
.noms {
  font-weight: 900;
  color: #a08bff;
}
</style>
