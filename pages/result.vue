<script setup lang="ts">
import type { FinalReport, MbtiType, TypeCandidate } from '~/types/mindtrace'

definePageMeta({ middleware: ['require-auth'] })

const route = useRoute()
const api = useApiClient()
const clientSession = useClientSession()

const loading = ref(true)
const exporting = ref(false)
const report = ref<FinalReport | null>(null)
const errorMessage = ref('')
const loadingLabel = ref('결과를 불러오는 중...')
const ratio = ref<'story' | 'square'>('story')
const shareCardRef = ref<{ rootEl: HTMLElement | null } | null>(null)
const copied = ref(false)

const sessionId = computed(() => {
  if (typeof route.query.sessionId === 'string' && route.query.sessionId.length > 0) {
    return route.query.sessionId
  }
  return clientSession.getSessionId()
})

const normalizeCandidates = <T extends string>(
  input: unknown,
  fallback: TypeCandidate<T>[]
): TypeCandidate<T>[] => {
  if (!Array.isArray(input)) return fallback

  const cleaned = input
    .map((raw) => {
      const item = raw as any
      const type = typeof item?.type === 'string' ? item.type : ''
      const p = Number(item?.p)
      if (!type) return null
      return {
        type: type as T,
        p: Number.isFinite(p) ? p : 0
      }
    })
    .filter(Boolean) as TypeCandidate<T>[]

  return cleaned.length > 0 ? cleaned : fallback
}

const normalizeReport = (input: any, sid: string): FinalReport => {
  const fallbackMbtiTop = (typeof input?.mbti?.top === 'string' ? input.mbti.top : 'INFP') as MbtiType
  const fallbackEnneaTop = typeof input?.enneagram?.top === 'string' ? input.enneagram.top : '5w6'

  const summaryShort =
    (typeof input?.summaryShort === 'string' && input.summaryShort.trim()) ||
    (typeof input?.short_caption_ko === 'string' && input.short_caption_ko.trim()) ||
    `${fallbackMbtiTop} · ${fallbackEnneaTop} 신호가 가장 높았습니다.`

  const corePattern =
    (typeof input?.corePattern === 'string' && input.corePattern.trim()) ||
    (typeof input?.narrative_ko === 'string' && input.narrative_ko.trim()) ||
    '응답 패턴을 기준으로 볼 때, 일관된 판단 방식과 반응 리듬이 확인되었습니다.'

  const outerVsInner =
    (typeof input?.outerVsInner === 'string' && input.outerVsInner.trim()) ||
    (typeof input?.misperception_ko === 'string' && input.misperception_ko.trim()) ||
    '겉으로는 이렇게 보일 수 있으나 실제로는 내부 기준을 정리한 뒤 반응하는 편입니다.'

  const strengthContexts = Array.isArray(input?.strengthContexts)
    ? input.strengthContexts.filter((item: unknown) => typeof item === 'string' && item.trim().length > 0)
    : []

  const communicationTips = Array.isArray(input?.communicationTips)
    ? input.communicationTips.filter((item: unknown) => typeof item === 'string' && item.trim().length > 0)
    : []

  return {
    sessionId: typeof input?.sessionId === 'string' ? input.sessionId : sid,
    mbti: {
      top: fallbackMbtiTop,
      candidates: normalizeCandidates<MbtiType>(input?.mbti?.candidates, [{ type: fallbackMbtiTop, p: 1 }])
    },
    enneagram: {
      top: fallbackEnneaTop,
      candidates: normalizeCandidates<string>(input?.enneagram?.candidates, [{ type: fallbackEnneaTop, p: 1 }])
    },
    nickname_ko:
      (typeof input?.nickname_ko === 'string' && input.nickname_ko.trim()) ||
      `${fallbackMbtiTop} 해석 리포트`,
    summaryShort,
    corePattern,
    outerVsInner,
    strengthContexts:
      strengthContexts.length > 0
        ? strengthContexts.slice(0, 5)
        : ['기준이 분명한 문제 해결 상황', '우선순위를 빠르게 정해야 하는 상황', '관계와 성과 균형이 필요한 협업'],
    stressPattern:
      (typeof input?.stressPattern === 'string' && input.stressPattern.trim()) ||
      '압박이 높을수록 판단 기준을 더 엄격하게 적용하는 경향이 있습니다. 이때 선택 기준을 줄이면 피로를 낮출 수 있습니다.',
    misreadByOthers:
      (typeof input?.misreadByOthers === 'string' && input.misreadByOthers.trim()) ||
      '주변에서는 반응이 느리다고 볼 수 있지만, 실제로는 오래 가는 선택을 위해 검증 단계를 거치는 경우가 많습니다.',
    communicationTips:
      communicationTips.length > 0
        ? communicationTips.slice(0, 5)
        : ['요청의 목적과 기준을 함께 공유해 주세요.', '피드백은 구체 사례 중심으로 전달해 주세요.', '급한 결정은 우선순위를 먼저 맞춰 주세요.'],
    whyThisType:
      (typeof input?.whyThisType === 'string' && input.whyThisType.trim()) ||
      '상위 후보 확률과 응답 패턴을 함께 검토했을 때 현재 결과가 가장 일관되게 나타났습니다.',
    mbtiCompetitionNote:
      (typeof input?.mbtiCompetitionNote === 'string' && input.mbtiCompetitionNote.trim()) ||
      '상위 MBTI 후보 간 경합이 있었지만 후반 응답의 안정성 차이로 현재 타입이 우세했습니다.',
    enneaCompetitionNote:
      (typeof input?.enneaCompetitionNote === 'string' && input.enneaCompetitionNote.trim()) ||
      'Enneagram 경합 후보와 비교했을 때 스트레스 반응 패턴이 현재 결과와 더 잘 맞았습니다.',
    growthHint:
      typeof input?.growthHint === 'string' && input.growthHint.trim() ? input.growthHint : undefined,
    decisionStyle:
      typeof input?.decisionStyle === 'string' && input.decisionStyle.trim()
        ? input.decisionStyle
        : undefined,
    narrative_ko:
      (typeof input?.narrative_ko === 'string' && input.narrative_ko.trim()) ||
      corePattern,
    misperception_ko:
      (typeof input?.misperception_ko === 'string' && input.misperception_ko.trim()) ||
      outerVsInner,
    short_caption_ko:
      (typeof input?.short_caption_ko === 'string' && input.short_caption_ko.trim()) ||
      summaryShort,
    deepInsights: input?.deepInsights && typeof input.deepInsights === 'object'
      ? input.deepInsights
      : undefined,
    style_tags: {
      quadra:
        input?.style_tags?.quadra === 'NT' ||
        input?.style_tags?.quadra === 'ST' ||
        input?.style_tags?.quadra === 'NF' ||
        input?.style_tags?.quadra === 'SF'
          ? input.style_tags.quadra
          : 'NF',
      tone: 'C'
    }
  }
}

const loadResult = async () => {
  const sid = sessionId.value
  if (!sid) {
    await navigateTo('/test')
    return
  }

  const cached = clientSession.loadReport(sid)
  if (cached) {
    report.value = normalizeReport(cached, sid)
    loading.value = false
    return
  }

  try {
    loadingLabel.value = '저장된 결과를 확인하는 중...'
    const fromApi = await api.get<FinalReport>(`/api/result/${sid}`)
    const normalized = normalizeReport(fromApi, sid)
    report.value = normalized
    clientSession.saveReport(sid, normalized)
  }
  catch {
    try {
      loadingLabel.value = '결과 정리 중...'
      const finalized = await api.post<FinalReport>('/api/finalize', { sessionId: sid })
      const normalized = normalizeReport(finalized, sid)
      report.value = normalized
      clientSession.saveReport(sid, normalized)
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
  loadingLabel.value = '결과를 다시 불러오는 중...'
  await loadResult()
}

onMounted(async () => {
  await loadResult()
})
</script>

<template>
  <main class="mx-auto max-w-6xl">
    <section class="soft-card p-5 sm:p-8">
      <div v-if="loading" class="py-20 text-center">
        <div class="inline-flex items-center gap-3 text-sm font-bold text-ink/80">
          <span class="h-5 w-5 animate-spin rounded-full border-2 border-ink/30 border-t-ink" />
          {{ loadingLabel }}
        </div>
      </div>

      <div v-else-if="report" class="grid gap-5 xl:grid-cols-[1.45fr_1fr]">
        <article class="space-y-4 sm:space-y-5">
          <section class="rounded-3xl bg-white/95 p-4 sm:p-6">
            <h1 class="font-title text-3xl font-extrabold sm:text-4xl">{{ report.nickname_ko }}</h1>
            <p class="mt-2 text-lg font-bold text-ink/80">{{ report.mbti.top }} · {{ report.enneagram.top }}</p>
            <div class="mt-3 flex flex-wrap gap-2">
              <ResultBadge label="MBTI" :value="report.mbti.top" tone="peach" />
              <ResultBadge label="Enneagram" :value="report.enneagram.top" tone="mint" />
              <ResultBadge label="Quadra" :value="report.style_tags.quadra" tone="sky" />
            </div>
          </section>

          <section class="rounded-3xl bg-white/92 p-5">
            <h2 class="mb-2 text-base font-extrabold">요약</h2>
            <p class="text-sm leading-7 sm:text-base">{{ report.summaryShort }}</p>
          </section>

          <section class="rounded-3xl bg-white/92 p-5">
            <h2 class="mb-2 text-base font-extrabold">핵심 해석</h2>
            <p class="text-sm leading-7 sm:text-base">{{ report.corePattern }}</p>
          </section>

          <section class="rounded-3xl border border-black/5 bg-white/95 p-5">
            <h2 class="mb-2 text-base font-extrabold">겉으로 보이는 모습 vs 실제 기준</h2>
            <p class="text-sm leading-7 sm:text-base">{{ report.outerVsInner }}</p>
          </section>

          <section class="rounded-3xl bg-white/92 p-5">
            <h2 class="mb-3 text-base font-extrabold">강점이 잘 드러나는 상황</h2>
            <ul class="grid gap-2 text-sm leading-6 sm:grid-cols-2 sm:text-base">
              <li
                v-for="item in report.strengthContexts"
                :key="`strength-${item}`"
                class="rounded-2xl bg-mint/50 px-3 py-2 font-semibold"
              >
                {{ item }}
              </li>
            </ul>
          </section>

          <section class="rounded-3xl border border-black/5 bg-white/95 p-5">
            <h2 class="mb-2 text-base font-extrabold">꼬일 때 나오는 패턴 / 주의 포인트</h2>
            <p class="text-sm leading-7 sm:text-base">{{ report.stressPattern }}</p>
          </section>

          <section class="rounded-3xl bg-white/92 p-5">
            <h2 class="mb-2 text-base font-extrabold">주변 사람이 오해하기 쉬운 부분</h2>
            <p class="text-sm leading-7 sm:text-base">{{ report.misreadByOthers }}</p>
          </section>

          <section class="rounded-3xl bg-white/92 p-5">
            <h2 class="mb-3 text-base font-extrabold">소통 팁</h2>
            <ul class="grid gap-2 text-sm leading-6 sm:text-base">
              <li
                v-for="tip in report.communicationTips"
                :key="`tip-${tip}`"
                class="rounded-2xl bg-sky/55 px-3 py-2 font-semibold"
              >
                {{ tip }}
              </li>
            </ul>
          </section>

          <section v-if="report.deepInsights" class="rounded-3xl bg-white/92 p-4 sm:p-5">
            <h2 class="mb-2 text-base font-extrabold">심층 분석 요약</h2>
            <p class="text-sm leading-7 sm:text-base">{{ report.deepInsights.responsePatternSummary }}</p>

            <div class="mt-4 overflow-x-auto">
              <table class="min-w-[540px] w-full text-left text-sm">
                <thead>
                  <tr class="text-ink/70">
                    <th class="px-2 py-2">축</th>
                    <th class="px-2 py-2">기울기</th>
                    <th class="px-2 py-2">신뢰도</th>
                    <th class="px-2 py-2">해석</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="item in report.deepInsights.axisNarratives"
                    :key="`axis-${item.axis}`"
                    class="border-t border-ink/8 align-top"
                  >
                    <td class="px-2 py-2 font-bold">{{ item.axis }}</td>
                    <td class="px-2 py-2">{{ item.leaning }}</td>
                    <td class="px-2 py-2">{{ toPercent(item.confidence) }}</td>
                    <td class="px-2 py-2 text-ink/80">{{ item.summary }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p class="mt-4 text-sm leading-7 sm:text-base">{{ report.deepInsights.confidenceCommentary }}</p>

            <div class="mt-4 space-y-2">
              <h3 class="text-sm font-extrabold">응답 근거 인용</h3>
              <div
                v-for="(evidence, idx) in report.deepInsights.evidenceHighlights"
                :key="`evidence-${idx}`"
                class="rounded-2xl bg-sky/35 p-3"
              >
                <p class="text-sm font-bold">Q. {{ evidence.question }}</p>
                <p class="mt-1 text-sm">답변: {{ evidence.answer === 'yes' ? '그렇다' : '아니다' }}</p>
                <p class="mt-1 text-sm text-ink/80">해석: {{ evidence.interpretation }}</p>
                <p class="mt-1 text-sm text-ink/80">영향: {{ evidence.impact }}</p>
              </div>
            </div>
          </section>

          <section class="rounded-3xl bg-white/92 p-5">
            <h2 class="mb-2 text-base font-extrabold">왜 이 결과로 봤는지</h2>
            <p class="text-sm leading-7 sm:text-base">{{ report.whyThisType }}</p>

            <div class="mt-4 grid gap-3 sm:grid-cols-2">
              <div class="rounded-2xl bg-peach/45 p-3">
                <h3 class="mb-1 text-sm font-extrabold">MBTI 경합 노트</h3>
                <p class="text-sm leading-6">{{ report.mbtiCompetitionNote }}</p>
              </div>
              <div class="rounded-2xl bg-mint/45 p-3">
                <h3 class="mb-1 text-sm font-extrabold">Enneagram 경합 노트</h3>
                <p class="text-sm leading-6">{{ report.enneaCompetitionNote }}</p>
              </div>
            </div>

            <div class="mt-4 grid gap-2 sm:grid-cols-3">
              <div
                v-for="candidate in report.mbti.candidates.slice(0, 3)"
                :key="candidate.type"
                class="rounded-2xl bg-lilac/70 px-3 py-2 text-sm font-bold"
              >
                MBTI {{ candidate.type }} · {{ toPercent(candidate.p) }}
              </div>
            </div>

            <div class="mt-3 grid gap-2 sm:grid-cols-2">
              <div
                v-for="candidate in report.enneagram.candidates.slice(0, 2)"
                :key="candidate.type"
                class="rounded-2xl bg-lilac/45 px-3 py-2 text-sm font-bold"
              >
                Ennea {{ candidate.type }} · {{ toPercent(candidate.p) }}
              </div>
            </div>

            <div v-if="report.decisionStyle" class="mt-4 rounded-2xl bg-white/85 p-3">
              <h3 class="mb-1 text-sm font-extrabold">결정 스타일</h3>
              <p class="text-sm leading-6">{{ report.decisionStyle }}</p>
            </div>

            <div v-if="report.growthHint" class="mt-3 rounded-2xl bg-white/85 p-3">
              <h3 class="mb-1 text-sm font-extrabold">성장 힌트</h3>
              <p class="text-sm leading-6">{{ report.growthHint }}</p>
            </div>
          </section>
        </article>

        <aside class="space-y-4 xl:pl-1">
          <div class="rounded-3xl bg-white/92 p-4 lg:sticky lg:top-6">
            <h2 class="mb-3 text-sm font-extrabold">공유 카드</h2>
            <div class="mb-4 flex gap-2">
              <BaseButton
                variant="ghost"
                class="flex-1"
                :class="ratio === 'story' ? 'bg-peach' : ''"
                @click="ratio = 'story'"
              >
                9:16 스토리
              </BaseButton>
              <BaseButton
                variant="ghost"
                class="flex-1"
                :class="ratio === 'square' ? 'bg-mint' : ''"
                @click="ratio = 'square'"
              >
                1:1 피드
              </BaseButton>
            </div>

            <div class="overflow-x-auto rounded-3xl bg-lilac/35 p-2 sm:p-4">
              <div class="flex min-w-0 justify-center">
                <div class="origin-top scale-[0.9] sm:scale-100">
                  <ShareCard
                    ref="shareCardRef"
                    :report="report"
                    :ratio="ratio"
                  />
                </div>
              </div>
            </div>

            <div class="mt-4 grid grid-cols-1 gap-2">
              <BaseButton :disabled="exporting" @click="downloadImage">
                <span v-if="exporting" class="inline-flex items-center gap-2">
                  <span class="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-white" />
                  이미지 생성 중...
                </span>
                <span v-else>이미지 저장</span>
              </BaseButton>
              <BaseButton variant="secondary" @click="copyCaption">
                {{ copied ? '복사 완료!' : '캡션 복사' }}
              </BaseButton>
              <BaseButton variant="ghost" @click="restart">다시 테스트하기</BaseButton>
            </div>
          </div>
        </aside>
      </div>

      <div v-else class="rounded-3xl bg-[#ffe0ec] px-4 py-4 text-sm font-bold text-[#b93b64]">
        <p>{{ errorMessage || '앗, 결과를 잠깐 불러오지 못했어요.' }}</p>
        <BaseButton variant="ghost" class="mt-3 w-full sm:w-auto" @click="retryLoad">
          다시 불러오기
        </BaseButton>
      </div>
    </section>
  </main>
</template>
