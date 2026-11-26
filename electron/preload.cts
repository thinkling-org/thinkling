import type { DesktopUpdates, DesktopUpdateState } from '../src/lib/desktop-updates.ts'

const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron')

// Sandboxed preloads must be CommonJS and cannot require local modules at runtime.
const updates: DesktopUpdates = {
  getState: () => ipcRenderer.invoke('updates:state'),
  check: () => ipcRenderer.invoke('updates:check'),
  download: () => ipcRenderer.invoke('updates:download'),
  install: () => ipcRenderer.invoke('updates:install'),
  onState(listener) {
    const receive = (_event: Electron.IpcRendererEvent, state: DesktopUpdateState) => listener(state)
    ipcRenderer.on('updates:changed', receive)
    return () => ipcRenderer.removeListener('updates:changed', receive)
  },
}

contextBridge.exposeInMainWorld('thinklingUpdates', updates)
