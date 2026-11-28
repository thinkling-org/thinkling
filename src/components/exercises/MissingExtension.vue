<script setup lang="ts">
// Explains that a lesson card or exercise needs an extension that is missing or turned off.
import { t } from '../../lib/i18n.ts'
import { computed } from 'vue'
import Icon from '../Icon.vue'
import { installedPlugins } from '../../blocks/installed.ts'
import { UiButton } from '../ui/index.ts'

const props = defineProps<{ blockType: string }>()
const plugin = computed(() => installedPlugins.find((item) => item.id === props.blockType))
const name = computed(() => plugin.value?.name || props.blockType)
</script>

<template>
  <div class="card missing-extension" role="note">
    <Icon name="puzzle" :size="22" />
    <p>
      {{ plugin?.enabled === false
        ? t('This card uses the “{0}” extension, which is turned off.', [name])
        : t('This card uses the “{0}” extension, which is not installed.', [name]) }}
    </p>
    <UiButton size="sm" to="/extensions">{{ t('Manage extensions') }}</UiButton>
  </div>
</template>

<style scoped>
.missing-extension {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  color: var(--text-2);
}
.missing-extension p {
  flex: 1;
  margin: 0;
  font-weight: 700;
  line-height: 1.5;
}
</style>
