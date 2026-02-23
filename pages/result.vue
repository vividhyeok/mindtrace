<script setup lang="ts">
import type { FinalReport } from '~/types/mindtrace'

definePageMeta({ middleware: ['require-auth'] })

const route = useRoute()
const api = useApiClient()
const clientSession = useClientSession()

const loading = ref(true)
const exporting = ref(false)
const report = ref<FinalReport | null>(null)
const errorMessage = ref('')
const ratio = ref<'story' | 'square'>('story')
const shareCardRef = ref<{ rootEl: HTMLElement | null } | null>(null)
const copied = ref(false)

const sessionId = computed(() => {
  if (typeof route.query.sessionId === 'string' && route.query.sessionId.length > 0) {
    return route.query.sessionId
  }
  return clientSession.getSessionId()
})

const loadResult = async () => {
  const sid = sessionId.value
  if (!sid) {
    await navigateTo('/test')
    return
  }

  const cached = clientSession.loadReport(sid)
  if (cached) {
    report.value = cached
    loading.value = false
    return
  }

  try {
    const fromApi = await api.get<FinalReport>(`/api/result/${sid}`)
    report.value = fromApi
    clientSession.saveReport(sid, fromApi)
  }
  catch {
    try {
      const finalized = await api.post<FinalReport>('/api/finalize', { sessionId: sid })
      report.value = finalized
      clientSession.saveReport(sid, finalized)
    }
    catch (error: any) {
      errorMessage.value = error?.data?.statusMessage || '결과를 불러오지 못했습니다.'
    }
  }
  finally {
    loading.value = false
  }
}

const toPercent = (n: number) => `${Math.round(n * 100)}%`

const downloadImage = async () => {
  if (!report.value || !shareCardRef.value?.rootEl) return

  exporting.value = true
  try {
    const html2canvas = (await import('html2canvas')).default
    const canvas = await html2canvas(shareCardRef.value.rootEl, {
      scale: 3,
      useCORS: true,
      backgroundColor: '#ffffff'
    })

    const link = document.createElement('a')
    const ratioLabel = ratio.value === 'story' ? '9x16' : '1x1'
    link.download = `mindtrace-${ratioLabel}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }
  finally {
    exporting.value = false
  }
}

const copyCaption = async () => {
  if (!report.value) return
  await navigator.clipboard.writeText(report.value.short_caption_ko)
  copied.value = true
  window.setTimeout(() => {
    copied.value = false
  }, 1600)
}

const restart = async () => {
  clientSession.clearSession()
  await navigateTo('/test')
}

const retryLoad = async () => {
  errorMessage.value = ''
  report.value = null
  loading.value = true
  await loadResult()
}

onMounted(async () => {
  await loadResult()
})
</script>

<template>
  <main class="mx-auto max-w-5xl">
    <section class="soft-card p-6 sm:p-8">
      <div v-if="loading" class="py-20 text-center">
        <p class="text-base font-bold">결과를 불러오는 중...</p>
      </div>

      <div v-else-if="report" class="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <article class="space-y-5">
          <div>
            <h1 class="font-title text-4xl font-extrabold">{{ report.nickname_ko }}</h1>
            <p class="mt-2 text-lg font-bold text-ink/80">{{ report.mbti.top }} · {{ report.enneagram.top }}</p>
          </div>

          <div class="flex flex-wrap gap-2">
            <ResultBadge label="MBTI" :value="report.mbti.top" tone="peach" />
            <ResultBadge label="Enneagram" :value="report.enneagram.top" tone="mint" />
            <ResultBadge label="Quadra" :value="report.style_tags.quadra" tone="sky" />
            <ResultBadge label="Tone" :value="report.style_tags.tone" tone="lilac" />
          </div>

          <div class="rounded-3xl bg-white/90 p-4">
            <h2 class="mb-2 text-sm font-extrabold">MBTI 상위 후보</h2>
            <div class="grid gap-2 sm:grid-cols-3">
              <div
                v-for="candidate in report.mbti.candidates.slice(0, 3)"
                :key="candidate.type"
                class="rounded-2xl bg-peach/60 px-3 py-2 text-sm font-bold"
              >
                {{ candidate.type }} · {{ toPercent(candidate.p) }}
              </div>
            </div>
          </div>

          <div class="rounded-3xl bg-white/90 p-4">
            <h2 class="mb-2 text-sm font-extrabold">Enneagram 상위 후보</h2>
            <div class="grid gap-2 sm:grid-cols-2">
              <div
                v-for="candidate in report.enneagram.candidates.slice(0, 2)"
                :key="candidate.type"
                class="rounded-2xl bg-mint/60 px-3 py-2 text-sm font-bold"
              >
                {{ candidate.type }} · {{ toPercent(candidate.p) }}
              </div>
            </div>
          </div>

          <div class="rounded-3xl bg-white/90 p-5">
            <h2 class="mb-2 text-sm font-extrabold">해석</h2>
            <p class="text-sm leading-7 sm:text-base">{{ report.narrative_ko }}</p>
          </div>

          <div class="rounded-3xl bg-lilac/70 p-5">
            <h2 class="mb-2 text-sm font-extrabold">겉으로는 이렇게 보일 수 있으나 실제로는…</h2>
            <p class="text-sm leading-7 sm:text-base">{{ report.misperception_ko }}</p>
          </div>
        </article>

        <aside class="space-y-4">
          <div class="rounded-3xl bg-white/90 p-4">
            <h2 class="mb-3 text-sm font-extrabold">공유 카드</h2>
            <div class="mb-4 flex gap-2">
              <button
                class="soft-button-ghost flex-1"
                :class="ratio === 'story' ? 'bg-peach' : ''"
                @click="ratio = 'story'"
              >
                9:16 스토리
              </button>
              <button
                class="soft-button-ghost flex-1"
                :class="ratio === 'square' ? 'bg-mint' : ''"
                @click="ratio = 'square'"
              >
                1:1 피드
              </button>
            </div>

            <div class="flex justify-center rounded-3xl bg-lilac/50 p-4">
              <ShareCard
                ref="shareCardRef"
                :report="report"
                :ratio="ratio"
              />
            </div>

            <div class="mt-4 grid grid-cols-1 gap-2">
              <button class="soft-button-primary" :disabled="exporting" @click="downloadImage">
                {{ exporting ? '이미지 생성 중...' : 'Export Image' }}
              </button>
              <button class="soft-button-secondary" @click="copyCaption">
                {{ copied ? '복사 완료!' : 'Copy caption' }}
              </button>
              <button class="soft-button-ghost" @click="restart">다시 테스트하기</button>
            </div>
          </div>
        </aside>
      </div>

      <div v-else class="rounded-3xl bg-[#ffe0ec] px-4 py-4 text-sm font-bold text-[#b93b64]">
        <p>{{ errorMessage || '앗, 결과를 잠깐 불러오지 못했어요.' }}</p>
        <button class="soft-button-ghost mt-3 w-full sm:w-auto" @click="retryLoad">
          다시 불러오기
        </button>
      </div>
    </section>
  </main>
</template>
