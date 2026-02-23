<script setup lang="ts">
defineProps<{
  label: string
  value: string
  tone?: 'peach' | 'mint' | 'sky' | 'lilac'
}>()
</script>

<template>
  <div
    class="inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-bold shadow-sticker"
    :class="{
      'bg-peach/90': tone === 'peach',
      'bg-mint/90': tone === 'mint',
      'bg-sky/90': tone === 'sky',
      'bg-lilac': tone === 'lilac' || !tone
    }"
  >
    <span class="text-ink/70">{{ label }}</span>
    <span>{{ value }}</span>
  </div>
</template>
