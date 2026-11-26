<script setup lang="ts">
import { t, uiLocale } from '../lib/i18n.ts'
import { computed } from 'vue'
import { useApp } from '../stores/app.ts'
import { useDesktopUpdates } from '../stores/updates.ts'
import { getAiProvider } from '../lib/ai-providers.ts'
import Icon from './Icon.vue'
import Logo from './Logo.vue'
import DesktopUpdate from './DesktopUpdate.vue'

const app = useApp()
const updates = useDesktopUpdates()
const nav = computed(() => [
  { to: '/path', label: t('Learning path'), icon: 'home' },
  { to: '/flashcards', label: t('Flashcards'), icon: 'cards', badge: app.dueCards.length || null },
  { to: '/plan', label: 'Plan', icon: 'list' },
  { to: '/sandbox', label: t('Sandbox'), icon: 'terminal' },
  { to: '/extensions', label: t('Extensions'), icon: 'puzzle' },
  { to: '/settings', label: t('Settings'), icon: 'settings' },
])
const provider = computed(() => app.activeProvider)
const providerName = computed(() => (getAiProvider(app.settings.provider).shortName))
const fmt = (n) => n.toLocaleString(uiLocale())
</script>

<template>
  <div class="shell">
    <nav class="side" :aria-label="t('Main navigation')">
      <div class="brand">
        <Logo />
        <span v-if="updates.state" class="app-version" :title="t('Installed version: {0}', [updates.state.currentVersion])">v{{ updates.state.currentVersion }}</span>
      </div>
      <RouterLink v-for="n in nav" :key="n.to" :to="n.to" class="item" active-class="active">
        <Icon :name="n.icon" />
        <span class="lbl">{{ n.label }}</span>
        <span v-if="n.badge" class="badge">{{ n.badge }}</span>
      </RouterLink>
      <RouterLink to="/settings" class="conn card">
        <div class="row">
          <span class="dot" :class="{ off: !provider?.available }" />
          {{ providerName }} {{ provider?.available ? t('connected') : t('unavailable') }}
        </div>
        <span class="meta">localhost:{{ app.status?.port || 3141 }} · {{ app.settings.model || t('default model') }}{{ app.settings.effort ? ` · ${app.settings.effort}` : '' }}</span>
      </RouterLink>
    </nav>

    <div class="main">
      <header class="top">
        <slot name="top-left" />
        <DesktopUpdate compact />
        <div class="stats">
          <span class="stat" :class="{ dim: !app.streakAlive }" :title="app.streakAlive ? t('Learning streak') : t('Your streak ended. Do a lesson today to start a new one.')">
            <Icon name="flame" :size="22" style="color: var(--flame)" />{{ app.streakAlive ? app.stats.streak : 0 }} {{ (app.streakAlive ? app.stats.streak : 0) === 1 ? t('day') : t('days') }}
          </span>
          <span class="stat xp" :title="t('Experience points')">
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48"><polygon points="24,3 42,13.5 42,34.5 24,45 6,34.5 6,13.5" fill="#3B82F6" /><polygon points="24,12 33,17 33,31 24,36 15,31 15,17" fill="#93C5FD" /></svg>
            {{ fmt(app.stats.xp) }} XP
          </span>
          <RouterLink to="/review" class="stat cards" :title="t('Flashcards due')">
            <Icon name="cards" :size="20" />{{ app.dueCards.length }}
          </RouterLink>
        </div>
      </header>
      <slot />
    </div>
  </div>
</template>

<style scoped>
.shell {
  min-height: 100vh;
  display: flex;
}
.side {
  position: sticky;
  top: 0;
  height: 100vh;
  width: 256px;
  flex: none;
  border-right: 2px solid var(--divider);
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.brand {
  padding: 0 12px 24px;
}
.app-version {
  display: block;
  margin: 4px 0 0 46px;
  color: var(--muted);
  font-family: var(--mono);
  font-size: 12px;
}
.item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 2px solid transparent;
  color: var(--text-3);
  text-decoration: none;
  font-weight: 800;
  font-size: 15px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.item:hover {
  background: var(--surface);
  color: var(--text);
}
.item.active {
  background: var(--purple-soft);
  border-color: var(--purple);
  color: var(--purple-light);
}
.badge {
  margin-left: auto;
  background: var(--red);
  color: #fff;
  font-size: 12px;
  border-radius: 999px;
  padding: 2px 8px;
}
.conn {
  margin-top: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-decoration: none;
  color: var(--text);
}
.conn:hover {
  color: var(--text);
}
.conn .row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 800;
  font-size: 14px;
}
.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--green);
  box-shadow: 0 0 8px var(--green);
}
.dot.off {
  background: var(--red);
  box-shadow: 0 0 8px var(--red);
}
.meta {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 20px;
  padding: 16px 32px;
  border-bottom: 2px solid var(--divider);
  min-height: 70px;
}
.stats {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 22px;
}
.stat {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 900;
  font-size: 16px;
  color: var(--text);
  text-decoration: none;
}
.stat.dim {
  opacity: 0.55;
}
.stat.xp {
  color: var(--blue);
}
.stat.cards {
  color: var(--red-light);
}

@media (max-width: 860px) {
  .shell {
    flex-direction: column-reverse;
  }
  .side {
    position: sticky;
    bottom: 0;
    top: auto;
    height: auto;
    width: 100%;
    flex-direction: row;
    justify-content: space-around;
    padding: 10px 8px;
    border-right: none;
    border-top: 2px solid var(--divider);
    background: var(--bg);
    z-index: 20;
  }
  .brand,
  .conn,
  .lbl {
    display: none;
  }
  .item {
    position: relative;
    padding: 10px 14px;
  }
  .badge {
    position: absolute;
    top: 0;
    right: 0;
  }
  .top {
    padding: 12px 16px;
  }
  .stats {
    gap: 14px;
  }
}
</style>
