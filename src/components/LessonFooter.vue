<script setup lang="ts">
import Icon from './Icon.vue'

defineProps({
  tone: { type: String, default: 'idle' }, // idle | correct | almost | wrong | skipped
  title: { type: String, default: '' },
  message: { type: String, default: '' },
  wide: Boolean,
})
</script>

<template>
  <footer class="foot" :class="[tone, { wide }]">
    <div class="inner">
      <div class="content">
        <div v-if="$slots.navigation" class="navigation"><slot name="navigation" /></div>
        <div v-if="tone !== 'idle'" class="msg" role="status">
          <span class="badge">
            <Icon :name="tone === 'correct' ? 'check' : tone === 'almost' ? 'bulb' : tone === 'skipped' ? 'arrow-right' : 'x'" :size="22" :stroke="2.8" />
          </span>
          <div class="txt">
            <div class="t">{{ title }}</div>
            <div v-if="message" class="m"><slot name="message">{{ message }}</slot></div>
          </div>
        </div>
        <div v-else class="left"><slot name="left" /></div>
      </div>
      <div class="trailing">
        <slot name="secondary" />
        <div class="actions"><slot /></div>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.foot {
  container-type: inline-size;
  border-top: 2px solid var(--divider);
  background: var(--bg);
  position: sticky;
  bottom: 0;
  z-index: 15;
}
.foot:not(.idle) {
  animation: dl-slide-up 0.2s ease-out;
}
.foot.correct {
  border-top-color: #1f3a2a;
}
.foot.almost {
  border-top-color: var(--yellow-soft);
}
.foot.wrong {
  border-top-color: var(--red-soft);
}
.foot.skipped {
  border-top-color: var(--border);
}
.inner {
  max-width: 1100px;
  margin: 0 auto;
  padding: 12px 24px;
  min-height: 80px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 24px;
  align-items: center;
}
.wide .inner { max-width: none; padding-inline: 28px; }
.content, .trailing { display: flex; align-items: center; gap: 20px; min-width: 0; }
.navigation { flex: none; }
.trailing { gap: 12px; }
.msg {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}
.left {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  min-width: 0;
}
.badge {
  flex: none;
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
}
.correct .badge {
  color: var(--green-light);
}
.almost .badge {
  color: var(--yellow-light);
}
.wrong .badge {
  color: var(--red-light);
}
.skipped .badge {
  color: var(--muted);
}
.txt {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.t {
  font-size: 16px;
  font-weight: 800;
  line-height: 1.35;
}
.correct .t {
  color: var(--green-light);
}
.almost .t {
  color: var(--yellow-light);
}
.wrong .t {
  color: var(--red-light);
}
.m {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
  max-height: 80px;
  overflow: auto;
}
.correct .m {
  color: var(--text-3);
}
.almost .m {
  color: var(--text-3);
}
.wrong .m {
  color: var(--text-3);
}
.actions {
  display: flex;
  gap: 12px;
  flex: none;
}
.m :deep(p) { margin: 0; }
.actions :deep(.btn) {
  min-height: 44px;
  padding: 10px 24px;
  font-size: 15px;
  text-transform: none;
  letter-spacing: normal;
  border-radius: 12px;
  border-bottom-width: 3px;
}
.content :deep(.btn-ghost) {
  padding: 8px 10px;
  border: 0;
  background: transparent;
  text-transform: none;
  letter-spacing: normal;
  font-size: 14px;
  font-weight: 700;
  white-space: normal;
}
.content :deep(.btn-ghost:active:not(:disabled)) { transform: none; margin-bottom: 0; }
@container (max-width: 740px) {
  .inner {
    padding: 12px 16px;
    gap: 12px;
    grid-template-columns: minmax(0, 1fr);
  }
  .wide .inner { padding-inline: 16px; }
  .content { gap: 12px; }
  .trailing { justify-content: flex-end; }
  .t { font-size: 15px; }
}
</style>
