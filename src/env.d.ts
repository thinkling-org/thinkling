interface Window {
  thinklingUpdates?: import('./lib/desktop-updates.ts').DesktopUpdates
  webkitAudioContext?: typeof AudioContext
  flushThinklingSave?: () => Promise<unknown>
}
