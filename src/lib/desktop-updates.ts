export type UpdateStatus = 'disabled' | 'idle' | 'checking' | 'current' | 'available'
  | 'downloading' | 'downloaded' | 'installing' | 'error'

export type UpdateAction = 'check' | 'download' | 'install'

export interface DesktopUpdateState {
  status: UpdateStatus
  currentVersion: string
  availableVersion?: string
  percent?: number
  retry?: UpdateAction
}

export interface DesktopUpdates {
  getState(): Promise<DesktopUpdateState>
  check(): Promise<DesktopUpdateState>
  download(): Promise<DesktopUpdateState>
  install(): Promise<DesktopUpdateState>
  onState(listener: (state: DesktopUpdateState) => void): () => void
}
