interface Window {
  webkitAudioContext?: typeof AudioContext
  flushCodenomsSave?: () => Promise<unknown>
}
