const recordings = new Map()
let activeAudio

export function playRecording(audio) {
  const previous = activeAudio?.deref()
  if (previous && previous !== audio) previous.pause()
  activeAudio = new WeakRef(audio)
  return audio.play()
}

export function getRecording(chunks, design = null) {
  const key = JSON.stringify([chunks, design])
  const cached = recordings.get(key)
  if (cached) return cached

  const recording = generateRecording(chunks, design).catch((error) => {
    if (recordings.get(key) === recording) recordings.delete(key)
    throw error
  })
  recordings.set(key, recording)
  if (recordings.size > 5) recordings.delete(recordings.keys().next().value)
  return recording
}

async function generateRecording(chunks, design) {
  if (chunks.length > 1) {
    const marker = await getPauseMarker()
    if (marker) chunks = groupSpeechChunks(chunks, marker)
  }
  const samples = []
  let header
  let size = 0
  for (const [index, { text, pauseAfter }] of chunks.entries()) {
    const response = await fetch('/api/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, design }),
    })
    if (!response.ok) {
      const { error } = await response.json().catch(() => ({}))
      throw new Error(error || 'Nie udało się wygenerować nagrania.')
    }

    // ZONOS returns 16-bit mono PCM with a 44-byte RIFF header.
    const wav = await response.arrayBuffer()
    const partHeader = new DataView(wav)
    if (wav.byteLength < 44 || partHeader.getUint32(36) !== 0x64617461
      || partHeader.getUint32(40, true) !== wav.byteLength - 44
      || partHeader.getUint16(20, true) !== 1 || partHeader.getUint16(22, true) !== 1
      || partHeader.getUint16(34, true) !== 16 || wav.byteLength % 2 !== 0) {
      throw new Error('ZONOS3-Mini zwrócił nieprawidłowe nagranie.')
    }
    const sampleRate = partHeader.getUint32(24, true)
    const blockAlign = partHeader.getUint16(32, true)
    header ||= new DataView(wav.slice(0, 44))
    normalizeSpeechVolume(new DataView(wav, 44), sampleRate, text.includes('\uE003'))
    const pcm = new Uint8Array(wav, 44)
    size += pcm.length
    samples.push(pcm)
    if (pauseAfter && index < chunks.length - 1) {
      const silence = new Uint8Array(Math.round(sampleRate * 0.3) * blockAlign)
      size += silence.length
      samples.push(silence)
    }
  }
  header.setUint32(4, size + 36, true)
  header.setUint32(40, size, true)
  return new Blob([header, ...samples], { type: 'audio/wav' })
}

async function getPauseMarker() {
  try {
    const response = await fetch('/api/speech/capabilities')
    if (response.ok) return (await response.json()).pauseMarker
  } catch {
    return null
  }
  return null
}

function groupSpeechChunks(chunks, marker) {
  const groups = []
  let current = { ...chunks[0] }
  for (const chunk of chunks.slice(1)) {
    const joiner = current.pauseAfter ? `${marker} ` : ' '
    if (current.text.length + joiner.length + chunk.text.length > 450) {
      groups.push(current)
      current = { ...chunk }
    } else {
      current.text += joiner + chunk.text
      current.pauseAfter = chunk.pauseAfter
    }
  }
  groups.push(current)
  return groups
}

function normalizeSpeechVolume(pcm, sampleRate, hasNativePauses) {
  const windowSize = Math.max(1, Math.round(sampleRate * 0.02)) * 2
  const windows = []
  for (let start = 0; start < pcm.byteLength; start += windowSize) {
    const end = Math.min(start + windowSize, pcm.byteLength)
    let energy = 0
    let peak = 0
    for (let offset = start; offset < end; offset += 2) {
      const value = pcm.getInt16(offset, true)
      energy += value * value
      peak = Math.max(peak, Math.abs(value))
    }
    const count = (end - start) / 2
    windows.push({ energy, count, power: energy / count, peak })
  }

  const whole = activeSpeechLevel(windows)
  if (!whole.rms) return
  const baselineGain = Math.min(3200 / whole.rms, 6, 29490 / whole.peak)
  const boundaries = hasNativePauses ? pauseBoundaries(windows, whole.loudest) : []
  let start = 0
  for (const end of [...boundaries, windows.length]) {
    let gain = baselineGain
    if (boundaries.length) {
      const phrase = activeSpeechLevel(windows.slice(start, end))
      if (phrase.rms && phrase.rms < whole.rms * 0.75) {
        gain = Math.min(baselineGain * (whole.rms / phrase.rms), 6, 29490 / phrase.peak)
      }
    }
    for (let offset = start * windowSize; offset < Math.min(end * windowSize, pcm.byteLength); offset += 2) {
      pcm.setInt16(offset, Math.round(pcm.getInt16(offset, true) * gain), true)
    }
    start = end
  }
}

function activeSpeechLevel(windows) {
  let loudest = 0
  let peak = 0
  for (const window of windows) {
    loudest = Math.max(loudest, window.power)
    peak = Math.max(peak, window.peak)
  }
  const gate = Math.max(loudest * 0.01, 20 ** 2)
  let energy = 0
  let count = 0
  for (const window of windows) {
    if (window.power < gate) continue
    energy += window.energy
    count += window.count
  }
  return { rms: count ? Math.sqrt(energy / count) : 0, peak, loudest }
}

function pauseBoundaries(windows, loudest) {
  const threshold = Math.min(300 ** 2, Math.max(80 ** 2, loudest * 0.002))
  const boundaries = []
  let quietStart = 0
  for (const [index, window] of windows.entries()) {
    if (window.power < threshold) continue
    // The native 250 ms pauses leave room to change gain in the middle of the gap.
    if (quietStart > 0 && index - quietStart >= 7) {
      boundaries.push(Math.floor((quietStart + index) / 2))
    }
    quietStart = index + 1
  }
  return boundaries
}
