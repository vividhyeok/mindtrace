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

interface AuthIssueState {
  code: string
  title: string
  message: string
}

const route = useRoute()
const api = useApiClient()
const clientSession = useClientSession()

const loading = ref(true)
const answering = ref(false)
const finalizing = ref(false)
const errorMessage = ref('')
const sessionId = ref('')
const currentQuestion = ref<PublicQuestion | null>(null)
const progress = ref({ current: 0, max: 28, ratio: 0 })
const resumeSnapshot = ref<SessionSnapshot | null>(null)
const selectedAnswer = ref<'yes' | 'no' | null>(null)
const authIssue = ref<AuthIssueState | null>(null)

const progressVisual = computed(() => {
  return Math.min(94, 14 + progress.value.current * 6)
})

const getErrorReasonCode = (error: any): string => {
  return String(error?.data?.code || error?.data?.data?.code || '')
}

const resolveAuthIssue = (error: any): AuthIssueState | null => {
  const statusCode = Number(error?.statusCode || error?.data?.statusCode || 0)
  if (statusCode !== 401) return null

  const code = getErrorReasonCode(error)
  const devHint = import.meta.dev
    ? '개발 환경에서는 서버 재시작 시 in-memory 세션/토큰이 초기화될 수 있어요.'
    : ''

  if (code === 'SESSION_NOT_FOUND' || code === 'SESSION_EXPIRED') {
    return {
      code,
      title: '세션이 만료되었어요',
      message: `진행 중이던 테스트를 찾지 못했어요. ${devHint}`.trim()
    }
  }

  if (code === 'AUTH_TOKEN_MISSING' || code === 'AUTH_TOKEN_INVALID' || code === 'AUTH_TOKEN_EXPIRED') {
    return {
      code,
      title: '초대코드 재입력이 필요해요',
      message: `인증 토큰이 유효하지 않아요. 초대코드를 다시 입력해 주세요. ${devHint}`.trim()
    }
  }

  if (code === 'SESSION_TOKEN_MISMATCH') {
    return {
      code,
      title: '세션 정보가 맞지 않아요',
      message: '새 세션으로 다시 시작해 주세요.'
    }
  }

  return {
    code: code || 'UNKNOWN',
    title: '세션 확인이 필요해요',
    message: error?.data?.statusMessage || '인증 상태를 확인하지 못했어요. 다시 시작해 주세요.'
  }
}

const applyAuthIssue = (error: any) => {
  const issue = resolveAuthIssue(error)
  if (!issue) return false
  authIssue.value = issue
  errorMessage.value = issue.message
  answering.value = false
  finalizing.value = false
  return true
}

const fetchSnapshot = async (id: string) => {
  return await api.get<SessionSnapshot>(`/api/session/${id}`, {}, { authBehavior: 'stay' })
}

const startSession = async () => {
  const data = await api.post<StartResponse>('/api/start', {}, { authBehavior: 'stay' })
  authIssue.value = null
  sessionId.value = data.sessionId
  clientSession.setSessionId(data.sessionId)
  currentQuestion.value = data.firstQuestion
  progress.value = { current: 0, max: data.maxQuestions, ratio: 0 }
}

const finalizeNow = async () => {
  if (!sessionId.value) return

  finalizing.value = true
  try {
    const report = await api.post<FinalReport>('/api/finalize', {
      sessionId: sessionId.value
    }, { authBehavior: 'stay' })

    clientSession.saveReport(sessionId.value, report)

    await navigateTo({
      path: '/result',
      query: { sessionId: sessionId.value }
    })
  }
  catch (error: any) {
    if (applyAuthIssue(error)) return
    throw error
  }
  finally {
    finalizing.value = false
  }
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
  authIssue.value = null

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
      catch (error: any) {
        if (applyAuthIssue(error)) {
          return
        }
        clientSession.clearSession()
      }
    }

    await startSession()
  }
  catch (error: any) {
    if (applyAuthIssue(error)) {
      return
    }
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
  authIssue.value = null
  await applySnapshot(snapshot)
}

const startFresh = async () => {
  authIssue.value = null
  resumeSnapshot.value = null
  currentQuestion.value = null
  clientSession.clearSession()
  try {
    await startSession()
  }
  catch (error: any) {
    if (applyAuthIssue(error)) return
    errorMessage.value = error?.data?.statusMessage || '세션을 시작하지 못했습니다.'
  }
}

const restartAfterIssue = async () => {
  authIssue.value = null
  errorMessage.value = ''
  resumeSnapshot.value = null
  currentQuestion.value = null
  selectedAnswer.value = null
  finalizing.value = false
  answering.value = false
  clientSession.clearSession()
  try {
    await startSession()
  }
  catch (error: any) {
    if (applyAuthIssue(error)) return
    errorMessage.value = error?.data?.statusMessage || '세션을 시작하지 못했습니다.'
  }
}

const reenterInviteCode = async () => {
  clientSession.clearToken()
  clientSession.clearSession()
  await navigateTo('/?reauth=1')
}

const submitAnswer = async (answer: 'yes' | 'no') => {
  if (!currentQuestion.value || answering.value || finalizing.value) return

  answering.value = true
  authIssue.value = null
  selectedAnswer.value = answer
  errorMessage.value = ''

  try {
    const result = await api.post<AnswerResponse>('/api/answer', {
      sessionId: sessionId.value,
      questionId: currentQuestion.value.id,
      answer
    }, { authBehavior: 'stay' })

    progress.value = result.progress

    if (result.done) {
      currentQuestion.value = null
      await finalizeNow()
      return
    }

    currentQuestion.value = result.nextQuestion || null
  }
  catch (error: any) {
    if (applyAuthIssue(error)) {
      return
    }
    errorMessage.value = error?.data?.statusMessage || '응답 처리 중 오류가 발생했습니다.'
  }
  finally {
    answering.value = false
    selectedAnswer.value = null
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
        <div class="inline-flex items-center gap-3 text-sm font-bold text-ink/80">
          <span class="h-5 w-5 animate-spin rounded-full border-2 border-ink/30 border-t-ink" />
          테스트를 준비하는 중...
        </div>
      </div>

      <div v-else>
        <div v-if="authIssue" class="rounded-4xl border border-white/80 bg-white/92 p-6 shadow-soft">
          <p class="text-sm font-bold text-ink/70">세션 안내</p>
          <p class="mt-2 text-xl font-extrabold">{{ authIssue.title }}</p>
          <p class="mt-3 text-sm leading-6 text-ink/80">{{ authIssue.message }}</p>

          <div class="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <BaseButton variant="secondary" @click="restartAfterIssue">처음부터 다시 시작</BaseButton>
            <BaseButton @click="reenterInviteCode">초대코드 다시 입력</BaseButton>
          </div>
        </div>

        <div v-else-if="resumeSnapshot" class="rounded-4xl border border-white/80 bg-white/90 p-6 shadow-soft">
          <p class="text-sm font-bold text-ink/70">이어서 진행할 테스트가 있어요</p>
          <p class="mt-2 text-lg font-extrabold">질문 {{ resumeSnapshot.progress.current + 1 }}부터 이어서 진행</p>
          <p class="mt-2 text-sm text-ink/70">이어하기를 누르면 마지막 질문 상태로 복구돼요.</p>

          <div class="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <BaseButton variant="secondary" @click="continueExisting">이어하기</BaseButton>
            <BaseButton variant="ghost" @click="startFresh">새로 시작</BaseButton>
          </div>
        </div>

        <template v-else>
          <div class="mb-5">
            <div class="mb-2 flex items-center justify-between text-sm font-bold text-ink/70">
              <span>질문 {{ progress.current + 1 }}</span>
              <span>{{ answering ? '응답 처리 중' : finalizing ? '결과 정리 중' : '진행 중' }}</span>
            </div>
            <div class="h-3 rounded-full bg-lilac/80">
              <div
                class="h-3 rounded-full bg-[#6D28D9] transition-all duration-300"
                :style="{ width: `${progressVisual}%` }"
              />
            </div>
          </div>

          <div v-if="currentQuestion" class="rounded-4xl border border-white/80 bg-white/92 p-6 shadow-soft">
            <p class="mb-2 text-xs font-bold text-ink/60">질문 {{ progress.current + 1 }}</p>
            <p class="text-xl font-bold leading-8 sm:text-2xl">{{ currentQuestion.text_ko }}</p>

            <div class="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <BaseButton
                variant="secondary"
                :disabled="answering || finalizing"
                :class="selectedAnswer === 'yes' ? 'ring-3 ring-[#6D28D9]/25' : ''"
                @click="submitAnswer('yes')"
              >
                그렇다
              </BaseButton>
              <BaseButton
                :disabled="answering || finalizing"
                :class="selectedAnswer === 'no' ? 'ring-3 ring-[#6D28D9]/25' : ''"
                @click="submitAnswer('no')"
              >
                아니다
              </BaseButton>
            </div>

            <div v-if="answering" class="mt-4 inline-flex items-center gap-2 text-sm font-bold text-ink/80">
              <span class="h-4 w-4 animate-spin rounded-full border-2 border-ink/30 border-t-ink" />
              다음 질문 준비 중...
            </div>

            <p class="mt-4 text-xs font-bold text-ink/60">
              중립 없이 지금 더 끌리는 쪽을 선택해 주세요.
            </p>
          </div>
        </template>

        <div v-if="finalizing" class="mt-4 rounded-3xl bg-lilac/70 px-4 py-4">
          <div class="inline-flex items-center gap-2 text-sm font-bold text-ink/80">
            <span class="h-4 w-4 animate-spin rounded-full border-2 border-ink/30 border-t-ink" />
            결과 정리 중...
          </div>
        </div>

        <div v-if="errorMessage" class="mt-4 rounded-3xl bg-[#ffe0ec] px-4 py-3 text-sm font-bold text-[#b93b64]">
          {{ errorMessage }}
        </div>
      </div>
    </section>
  </main>
</template>
