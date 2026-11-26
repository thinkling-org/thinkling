<script setup lang="ts">
// Mounts a block through the public mount() API and keeps it in sync with its props.
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'
import type { PropType } from 'vue'
import { createBlockContext } from './context.ts'
import type { BlockDefinition, BlockInstance, BlockProps } from './types.ts'

const props = defineProps({
  block: { type: Object as PropType<BlockDefinition>, required: true },
  blockProps: { type: Object as PropType<BlockProps>, required: true },
})
const emit = defineEmits<{ event: [name: string, payload: unknown] }>()
const host = useTemplateRef<HTMLElement>('host')
let instance: BlockInstance | null = null

function mount() {
  const ctx = createBlockContext(props.block, (name, payload) => emit('event', name, payload))
  try {
    instance = props.block.mount(host.value, props.blockProps, ctx)
  } catch (err) {
    // A failing block must not take the lesson down with it.
    console.error(`[block ${props.block.id}] mount failed`, err)
    instance = null
  }
}

function unmount() {
  try {
    instance?.unmount()
  } catch (err) {
    console.error(`[block ${props.block.id}] unmount failed`, err)
  }
  instance = null
}

onMounted(mount)
onBeforeUnmount(unmount)
watch(() => props.block, () => {
  unmount()
  mount()
})
watch(() => props.blockProps, (next) => {
  try {
    instance?.update(next)
  } catch (err) {
    console.error(`[block ${props.block.id}] update failed`, err)
  }
})
</script>

<template>
  <div ref="host" class="block-host" :data-block="block.id" />
</template>

<style scoped>
/* The host must not change the card layout: the block's root behaves as a direct child. */
.block-host {
  display: contents;
}
</style>
