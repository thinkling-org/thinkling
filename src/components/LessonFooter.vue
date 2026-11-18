<script setup>
import Icon from './Icon.vue'

defineProps({
  tone: { type: String, default: 'idle' }, // idle | correct | almost | wrong | skipped
  title: { type: String, default: '' },
  message: { type: String, default: '' },
})
</script>

<template>
  <footer class="foot" :class="tone">
    <div class="inner">
      <div v-if="tone !== 'idle'" class="msg">
        <span class="badge">
          <Icon :name="tone === 'correct' ? 'check' : tone === 'almost' ? 'bulb' : tone === 'skipped' ? 'arrow-right' : 'x'" :size="30" :stroke="3.2" />
        </span>
        <div class="txt">
          <div class="t">{{ title }}</div>
          <div v-if="message" class="m"><slot name="message">{{ message }}</slot></div>
        </div>
      </div>
      <div v-else class="left"><slot name="left" /></div>
      <div class="actions"><slot /></div>
    </div>
  </footer>
</template>

<style scoped>
.foot {
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
  background: #16261d;
  border-top-color: #1f3a2a;
}
.foot.almost {
  background: var(--yellow-bg);
  border-top-color: var(--yellow-soft);
}
.foot.wrong {
  background: var(--red-bg);
  border-top-color: var(--red-soft);
}
.foot.skipped {
  background: var(--surface);
}
.inner {
  max-width: 1100px;
  margin: 0 auto;
  padding: 20px 32px;
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
}
.msg {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  flex: 1 1 420px;
  min-width: 0;
}
.left {
  display: flex;
  gap: 12px;
}
.badge {
  flex: none;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: #fff;
}
.correct .badge {
  color: var(--green-dark);
}
.almost .badge {
  color: var(--yellow-dark);
}
.wrong .badge {
  color: var(--red-dark);
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
  font-size: 22px;
  font-weight: 900;
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
  font-size: 15px;
  font-weight: 700;
  line-height: 1.5;
  max-height: 140px;
  overflow: auto;
}
.correct .m {
  color: #c4ebd3;
}
.almost .m {
  color: #e8d6a8;
}
.wrong .m {
  color: #f0c8cf;
}
.actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-left: auto;
}
@media (max-width: 700px) {
  .inner {
    padding: 14px 16px;
  }
  .badge {
    display: none;
  }
  .actions {
    width: 100%;
  }
  .actions :deep(.btn) {
    flex: 1;
  }
}
</style>
