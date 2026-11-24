import { play, playStep } from './sfx.js'

export const SOUND_PREVIEWS = [
  { id: 'correct', label: 'Good' },
  { id: 'almost', label: 'Almost' },
  { id: 'wrong', label: 'Wrong' },
  { id: 'steps', label: 'Code steps' },
  { id: 'flip', label: 'Flashcard' },
  { id: 'complete', label: 'Lesson complete' },
]

export function playSoundPreview(id) {
  if (id !== 'steps') return play(id)
  for (let step = 0; step < 6; step++) setTimeout(() => playStep(step), step * 170)
}
