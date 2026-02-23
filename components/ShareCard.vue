<script setup lang="ts">
import type { FinalReport } from '~/types/mindtrace'

const props = defineProps<{
  report: FinalReport
  ratio: 'story' | 'square'
}>()

const rootEl = ref<HTMLElement | null>(null)

const sizeClass = computed(() => {
  return props.ratio === 'story' ? 'h-[640px] w-[360px]' : 'h-[360px] w-[360px]'
})

defineExpose({ rootEl })
</script>

<template>
  <article
    ref="rootEl"
    :class="sizeClass"
    class="relative overflow-hidden rounded-[34px] border border-white/80 bg-white p-6 text-ink shadow-soft"
  >
    <div
      class="absolute -right-12 -top-12 h-52 w-52 rounded-full bg-peach/50"
      aria-hidden="true"
    />
    <div
      class="absolute -bottom-10 -left-10 h-44 w-44 rounded-full bg-mint/50"
      aria-hidden="true"
    />

    <div class="relative flex h-full flex-col">
      <div class="mb-4 flex items-start justify-between gap-3">
        <div>
          <p class="text-sm font-semibold text-ink/70">mindtrace 결과</p>
          <h3 class="font-title text-3xl font-extrabold">{{ report.mbti.top }} · {{ report.enneagram.top }}</h3>
        </div>
        <img
          src="/characters/mindtrace-buddy.svg"
          alt="mindtrace buddy"
          class="h-14 w-14 rounded-2xl border border-white/70 bg-lilac p-1"
        >
      </div>

      <div class="mb-3 rounded-3xl bg-lilac/70 px-4 py-3">
        <p class="text-xs font-bold text-ink/70">별명</p>
        <p class="text-lg font-extrabold">{{ report.nickname_ko }}</p>
      </div>

      <p class="text-sm leading-6">
        {{ report.summaryShort || report.short_caption_ko }}
      </p>

      <div class="mt-auto pt-4 text-xs font-bold text-ink/70">
        친구랑 같이 해보기 · invite only
      </div>
    </div>
  </article>
</template>
