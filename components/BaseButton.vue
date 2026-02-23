<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost'
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
    block?: boolean
  }>(),
  {
    variant: 'primary',
    type: 'button',
    disabled: false,
    block: false
  }
)

const variantClass = computed(() => {
  if (props.variant === 'secondary') {
    return 'bg-mint text-ink hover:bg-[#b9ecd7]'
  }

  if (props.variant === 'ghost') {
    return 'bg-white text-ink hover:bg-lilac'
  }

  return 'bg-[#6D28D9] text-white hover:bg-[#5b21b6]'
})
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    class="soft-button h-12 px-5 text-base font-bold"
    :class="[variantClass, block ? 'w-full' : '']"
  >
    <slot />
  </button>
</template>
