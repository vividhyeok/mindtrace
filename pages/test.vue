<script setup lang="ts">
import type { AnswerResponse, FinalReport, PublicQuestion, StartResponse } from '~/types/mindtrace'

definePageMeta({ middleware: ['require-auth'] })

interface SessionSnapshot {
  sessionId: string
  done: boolean
  finalized: boolean
  answerCount: number
  maxQuestions: number
  currentQuestion?: PublicQuestion
  progress: {
    current: number
    max: number
    ratio: number
  }
}

const route = useRoute()
const api = useApiClient()
const clientSession = useClientSession()

const loading = ref(true)
const answering = ref(false)
const errorMessage = ref('')
const sessionId = ref('')
const currentQuestion = ref<PublicQuestion | null>(null)
const progress = ref({ current: 0, max: 28, ratio: 0 })
const resumeSnapshot = ref<SessionSnapshot | null>(null)

const progressPercent = computed(() => Math.round(progress.value.ratio * 100))

const fetchSnapshot = async (id: string) => {
  return await api.get<SessionSnapshot>(`/api/session/${id}`)
}

const startSession = async () => {
  const data = await api.post<StartResponse>('/api/start', {})
  sessionId.value = data.sessionId
  clientSession.setSessionId(data.sessionId)
  currentQuestion.value = data.firstQuestion
  progress.value = { current: 0, max: data.maxQuestions, ratio: 0 }
}

const finalizeNow = async () => {
  if (!sessionId.value) return

  const report = await api.post<FinalReport>('/api/finalize', {
    sessionId: sessionId.value
  })

  clientSession.saveReport(sessionId.value, report)

  await navigateTo({
    path: '/result',
    query: { sessionId: sessionId.value }
  })
}

const applySnapshot = async (snapshot: SessionSnapshot) => {
  sessionId.value = snapshot.sessionId
  clientSession.setSessionId(snapshot.sessionId)
  progress.value = snapshot.progress
  currentQuestion.value = snapshot.currentQuestion || null

  if (snapshot.finalized) {
    await navigateTo({ path: '/result', query: { sessionId: snapshot.sessionId } })
    return
  }

  if (snapshot.done) {
    await finalizeNow()
  }
}

const initialize = async () => {
  loading.value = true
  errorMessage.value = ''

  try {
    const fromQuery = typeof route.query.sessionId === 'string' ? route.query.sessionId : ''
    const stored = clientSession.getSessionId()

    if (fromQuery) {
      const snapshot = await fetchSnapshot(fromQuery)
      await applySnapshot(snapshot)
      return
    }

    if (stored) {
      try {
        const snapshot = await fetchSnapshot(stored)

        if (snapshot.finalized) {
          await navigateTo({ path: '/result', query: { sessionId: stored } })
          return
        }

        if (snapshot.done) {
          sessionId.value = snapshot.sessionId
          await finalizeNow()
          return
        }

        sessionId.value = snapshot.sessionId
        progress.value = snapshot.progress
        resumeSnapshot.value = snapshot
        return
      }
      catch {
        clientSession.clearSession()
      }
    }

    await startSession()
  }
  catch (error: any) {
    errorMessage.value = error?.data?.statusMessage || '세션을 시작하지 못했습니다.'
  }
  finally {
    loading.value = false
  }
}

const continueExisting = async () => {
  if (!resumeSnapshot.value) return
  const snapshot = resumeSnapshot.value
  resumeSnapshot.value = null
  await applySnapshot(snapshot)
}

const startFresh = async () => {
  resumeSnapshot.value = null
  currentQuestion.value = null
  clientSession.clearSession()
  await startSession()
}

const submitAnswer = async (answer: 'yes' | 'no') => {
  if (!currentQuestion.value || answering.value) return

  answering.value = true
  errorMessage.value = ''

  try {
    const result = await api.post<AnswerResponse>('/api/answer', {
      sessionId: sessionId.value,
      questionId: currentQuestion.value.id,
      answer
    })

    progress.value = result.progress

    if (result.done) {
      currentQuestion.value = null
      await finalizeNow()
      return
    }

    currentQuestion.value = result.nextQuestion || null
  }
  catch (error: any) {
    errorMessage.value = error?.data?.statusMessage || '응답 처리 중 오류가 발생했습니다.'
  }
  finally {
    answering.value = false
  }
}

onMounted(async () => {
  await initialize()
})
</script>

<template>
  <main class="mx-auto max-w-3xl">
    <section class="soft-card p-6 sm:p-8">
      <div v-if="loading" class="py-20 text-center">
        <p class="text-base font-bold">테스트를 준비하는 중...</p>
      </div>

      <div v-else>
        <div v-if="resumeSnapshot" class="rounded-4xl border border-white/80 bg-white/90 p-6 shadow-soft">
          <p class="text-sm font-bold text-ink/70">진행 중인 테스트를 발견했어요</p>
          <p class="mt-2 text-base font-bold">
            {{ resumeSnapshot.progress.current }} / {{ resumeSnapshot.progress.max }} 문항까지 완료
          </p>
          <p class="mt-1 text-sm text-ink/70">
            이어서 진행하거나 새로 시작할 수 있어요.
          </p>

          <div class="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button class="soft-button-secondary text-lg" @click="continueExisting">이어하기</button>
            <button class="soft-button-ghost text-lg" @click="startFresh">새로 시작</button>
          </div>
        </div>

        <template v-else>
          <div class="mb-5">
            <div class="mb-2 flex items-center justify-between text-sm font-bold text-ink/70">
              <span>진행률</span>
              <span>{{ progress.current }} / {{ progress.max }} ({{ progressPercent }}%)</span>
            </div>
            <div class="h-3 rounded-full bg-lilac">
              <div
                class="h-3 rounded-full bg-peach transition-all duration-300"
                :style="{ width: `${progressPercent}%` }"
              />
            </div>
          </div>

          <div v-if="currentQuestion" class="rounded-4xl border border-white/80 bg-white/90 p-6 shadow-soft">
            <p class="mb-2 text-xs font-bold text-ink/60">질문 {{ progress.current + 1 }}</p>
            <p class="text-lg font-bold leading-8 sm:text-2xl">{{ currentQuestion.text_ko }}</p>

            <div class="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                class="soft-button-secondary w-full text-lg"
                :disabled="answering"
                @click="submitAnswer('yes')"
              >
                그렇다
              </button>
              <button
                class="soft-button-primary w-full text-lg"
                :disabled="answering"
                @click="submitAnswer('no')"
              >
                아니다
              </button>
            </div>

            <p class="mt-4 text-xs font-bold text-ink/60">
              중립 선택 없이, 지금 더 가까운 쪽을 골라 주세요.
            </p>
          </div>
        </template>

        <div v-if="errorMessage" class="mt-4 rounded-2xl bg-[#ffe0ec] px-4 py-3 text-sm font-bold text-[#b93b64]">
          {{ errorMessage }}
        </div>
      </div>
    </section>
  </main>
</template>
