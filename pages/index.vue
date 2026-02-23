<script setup lang="ts">
const passcode = ref('')
const pending = ref(false)
const errorMessage = ref('')

const session = useClientSession()

const submit = async () => {
  errorMessage.value = ''

  if (!passcode.value.trim()) {
    errorMessage.value = '초대 코드를 입력해 주세요.'
    return
  }

  pending.value = true
  try {
    const result = await $fetch<{ token: string, expiresAt: string }>('/api/auth', {
      method: 'POST',
      body: { passcode: passcode.value.trim() }
    })

    session.setToken(result.token, result.expiresAt)
    session.clearSession()
    await navigateTo('/test')
  }
  catch (error: any) {
    errorMessage.value = error?.data?.statusMessage || '코드가 일치하지 않습니다.'
  }
  finally {
    pending.value = false
  }
}

onMounted(() => {
  if (session.getToken() && !session.isTokenExpired()) {
    navigateTo('/test')
  }
})
</script>

<template>
  <main class="mx-auto max-w-2xl">
    <section class="soft-card fade-in p-6 sm:p-8">
      <p class="mb-2 text-sm font-bold text-ink/70">Invite Code Gate</p>
      <h1 class="font-title text-4xl font-extrabold leading-tight">친구 전용 성향 실험실</h1>
      <p class="mt-3 text-sm leading-6 text-ink/80 sm:text-base">
        mindtrace는 MBTI와 Enneagram 경향을 함께 보는 가벼운 성향 테스트예요.
        의료/진단 목적이 아닌 자기이해용입니다.
      </p>

      <div class="mt-6 rounded-3xl bg-lilac/60 p-4">
        <label for="passcode" class="mb-2 block text-sm font-bold">초대 코드</label>
        <input
          id="passcode"
          v-model="passcode"
          type="password"
          class="soft-input"
          placeholder="코드를 입력해 주세요"
          autocomplete="off"
          @keyup.enter="submit"
        >
        <p v-if="errorMessage" class="mt-2 text-sm font-bold text-[#d93f66]">{{ errorMessage }}</p>
        <button
          class="soft-button-primary mt-4 w-full"
          :disabled="pending"
          @click="submit"
        >
          {{ pending ? '확인 중...' : '테스트 시작하기' }}
        </button>
      </div>

      <div class="mt-5 flex flex-wrap gap-2 text-xs font-bold text-ink/70">
        <span class="sticker bg-peach/70">Yes/No only</span>
        <span class="sticker bg-mint/70">Adaptive 28문항 이내</span>
        <span class="sticker bg-sky/70">OpenAI o3 + 안정화 로직</span>
      </div>
    </section>
  </main>
</template>
