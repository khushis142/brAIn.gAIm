<script setup lang="ts">
import './zombie.css'

defineProps<{
  avatar: 'zombie' | 'half-human' | 'human'
  label: string
}>()
</script>

<template>
  <div class="zombie-avatar" role="img" :aria-label="label">
    <svg viewBox="0 0 200 240" aria-hidden="true">
      <use class="avatar-part leg-l" :href="`/assets/zombie/${avatar}.svg#leg-l`" />
      <use class="avatar-part leg-r" :href="`/assets/zombie/${avatar}.svg#leg-r`" />
      <use class="avatar-part arm-l" :href="`/assets/zombie/${avatar}.svg#arm-l`" />
      <use class="avatar-part body" :href="`/assets/zombie/${avatar}.svg#body`" />
      <use class="avatar-part arm-r" :href="`/assets/zombie/${avatar}.svg#arm-r`" />
      <use class="avatar-part head" :href="`/assets/zombie/${avatar}.svg#head`" />
    </svg>
  </div>
</template>
