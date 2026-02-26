import type { MbtiAxis } from '~/types/mindtrace'

export const AXIS_LETTERS: Record<MbtiAxis, [string, string]> = {
  IE: ['I', 'E'],
  SN: ['S', 'N'],
  TF: ['T', 'F'],
  JP: ['J', 'P']
}

export const EARLY_STOP = {
  mbtiTop1: 0.63,
  mbtiGap: 0.16,
  enneaTop1: 0.53,
  enneaGap: 0.1
}

export const BASE_CURATED_QUESTION_COUNT = 6
