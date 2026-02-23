import type { MbtiAxis } from '~/types/mindtrace'

export const AXIS_LETTERS: Record<MbtiAxis, [string, string]> = {
  IE: ['I', 'E'],
  SN: ['S', 'N'],
  TF: ['T', 'F'],
  JP: ['J', 'P']
}

export const EARLY_STOP = {
  mbtiTop1: 0.65,
  mbtiGap: 0.18,
  enneaTop1: 0.55,
  enneaGap: 0.12
}

export const BASE_CURATED_QUESTION_COUNT = 6
