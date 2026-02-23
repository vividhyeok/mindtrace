<script setup lang="ts">
const passcode = ref('')
const pending = ref(false)
const errorMessage = ref('')
const isModalOpen = ref(false)

const session = useClientSession()

const focusPasscodeInput = () => {
  if (!process.client) return
  nextTick(() => {
    const input = document.getElementById('invite-passcode')
    input?.focus()
  })
}

const openModal = () => {
  errorMessage.value = ''
  isModalOpen.value = true
  focusPasscodeInput()
}

const closeModal = () => {
  if (pending.value) return
  errorMessage.value = ''
  isModalOpen.value = false
}

const onBackdropClick = (event: MouseEvent) => {
  if (event.target === event.currentTarget) {
    closeModal()
  }
}

const onInputKeyup = (event: KeyboardEvent) => {
  if (event.key === 'Enter') {
    submit()
  }
}

const onWindowKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && isModalOpen.value) {
    closeModal()
  }
}

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
    isModalOpen.value = false
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

  window.addEventListener('keydown', onWindowKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeydown)
})

watch(isModalOpen, (opened) => {
  if (!process.client) return
  document.body.style.overflow = opened ? 'hidden' : ''
})
</script>

<template>
  <main class="mx-auto flex min-h-[calc(100vh-4rem)] max-w-2xl items-center justify-center px-1">
    <section class="soft-card fade-in w-full max-w-xl p-6 text-center sm:p-8">
      <h1 class="font-title text-[2rem] font-extrabold leading-[1.2] sm:text-[2.25rem]">
        성향 유형 검사
      </h1>
      <p class="mt-4 text-sm text-ink/70 sm:text-base">보통 2~3분 정도 걸려요</p>
      <p class="mt-2 text-sm text-ink/70 sm:text-base">너무 고민하지 말고 더 끌리는 쪽을 골라주세요</p>
      <div class="mt-6">
        <BaseButton class="w-full sm:w-auto sm:min-w-[168px]" @click="openModal">
          시작하기
        </BaseButton>
      </div>
    </section>

    <Teleport to="body">
      <div
        v-if="isModalOpen"
        class="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4 py-6"
        @click="onBackdropClick"
      >
        <section class="soft-card w-full max-w-md p-5 sm:p-6" @click.stop>
          <div class="mb-4 flex items-start justify-between gap-3">
            <h2 class="font-title text-2xl font-extrabold leading-tight">초대 코드 입력</h2>
            <button
              type="button"
              class="soft-button soft-button-ghost h-10 w-10 p-0 text-xl leading-none"
              :disabled="pending"
              aria-label="닫기"
              @click="closeModal"
            >
              ×
            </button>
          </div>

          <label for="invite-passcode" class="mb-2 block text-sm font-bold text-ink/80">초대 코드</label>
          <BaseInput
            id="invite-passcode"
            v-model="passcode"
            type="text"
            placeholder="코드를 입력해 주세요"
            autocomplete="off"
            :disabled="pending"
            @keyup="onInputKeyup"
          />

          <p v-if="errorMessage" class="mt-2 text-sm font-bold text-[#d93f66]">{{ errorMessage }}</p>

          <div class="mt-4 grid grid-cols-2 gap-3">
            <BaseButton variant="secondary" :disabled="pending" @click="closeModal">
              취소
            </BaseButton>
            <BaseButton :disabled="pending" @click="submit">
              <span v-if="pending" class="inline-flex items-center gap-2">
                <span class="h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-t-white" />
                확인 중...
              </span>
              <span v-else>확인</span>
            </BaseButton>
          </div>
        </section>
      </div>
    </Teleport>
  </main>
</template>
