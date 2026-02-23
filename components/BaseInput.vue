<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: string
    type?: string
    id?: string
    placeholder?: string
    autocomplete?: string
    disabled?: boolean
  }>(),
  {
    type: 'text',
    id: '',
    placeholder: '',
    autocomplete: 'off',
    disabled: false
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  keyup: [event: KeyboardEvent]
}>()

const onInput = (event: Event) => {
  const target = event.target as HTMLInputElement
  emit('update:modelValue', target.value)
}
</script>

<template>
  <input
    :id="id"
    :value="modelValue"
    :type="type"
    :placeholder="placeholder"
    :autocomplete="autocomplete"
    :disabled="disabled"
    class="soft-input h-12 border-border placeholder:text-[#7A748A] focus:border-[#6D28D9] focus:shadow-[0_0_0_3px_rgba(109,40,217,0.24)]"
    @input="onInput"
    @keyup="(event) => emit('keyup', event)"
  >
</template>
