<script setup lang="ts">
import Markdown from './Markdown.vue'

defineProps<{ title?: string; message: string }>()
</script>

<template>
  <div class="code-tutor">
    <svg aria-hidden="true" width="60" height="60" viewBox="0 0 64 64" class="mascot">
      <polygon points="32,4 56,18 56,46 32,60 8,46 8,18" fill="#7C5CFF" />
      <polygon points="32,4 56,18 32,30 8,18" fill="#A08BFF" />
      <ellipse cx="23" cy="36" rx="6.5" ry="7.5" fill="#fff" />
      <ellipse cx="41" cy="36" rx="6.5" ry="7.5" fill="#fff" />
      <circle cx="21" cy="37" r="3.4" fill="#15181B" />
      <circle cx="39" cy="37" r="3.4" fill="#15181B" />
    </svg>
    <div :key="message" class="bubble">
      <span v-if="title" class="kicker">{{ title }}</span>
      <Markdown :src="message" class="say" />
    </div>
  </div>
</template>

<style scoped>
.code-tutor {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  min-width: 0;
}
.mascot {
  flex: none;
  filter: drop-shadow(0 0 16px rgba(124, 92, 255, 0.7));
  animation: tutor-float 2.6s ease-in-out infinite;
}
@keyframes tutor-float {
  0%, 100% { transform: translateY(0) rotate(-4deg); }
  50% { transform: translateY(-4px) rotate(3deg); }
}
.bubble {
  position: relative;
  background: var(--text);
  color: var(--bg);
  border-radius: 16px;
  padding: 14px 16px;
  box-shadow: 0 5px 0 var(--text-3);
  max-width: 340px;
  min-width: 0;
  overflow-wrap: anywhere;
  display: flex;
  flex-direction: column;
  gap: 6px;
  animation: dl-pop 0.25s ease-out;
}
.bubble::before {
  content: '';
  position: absolute;
  left: -7px;
  top: 22px;
  width: 14px;
  height: 14px;
  background: var(--text);
  transform: rotate(45deg);
}
.kicker {
  position: relative;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--purple-dark);
}
.say {
  position: relative;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.45;
}
.say :deep(code) {
  background: #e3e0f5;
  color: #4a33b8;
}
@media (prefers-reduced-motion: reduce) {
  .mascot, .bubble { animation: none; }
}
</style>
