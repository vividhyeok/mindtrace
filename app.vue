<script setup lang="ts">
const route = useRoute()

const showHeader = computed(() => route.path !== '/')
</script>

<template>
  <div class="min-h-screen bg-soft-grid bg-[length:24px_24px]">
    <NuxtRouteAnnouncer />
    <div class="page-wrap">
      <header v-if="showHeader" class="mb-6 flex items-center justify-between">
        <NuxtLink to="/" class="group inline-flex items-center gap-2">
          <span class="text-2xl">🫧</span>
          <div>
            <p class="font-title text-2xl font-extrabold leading-none">mindtrace</p>
            <p class="text-xs text-ink/70">MBTI + Enneagram for friends</p>
          </div>
        </NuxtLink>
        <span class="sticker bg-sky">beta MVP</span>
      </header>
      <NuxtPage />
    </div>
  </div>
</template>
