// Substitute only the Docker transport. No test can reach the host's daemon.
const docker = {
  async version() { throw new Error('Docker is offline in browser E2E tests') },
  async listContainers() { return [] },
}

export function initialDocker() { return { docker, endpoint: null } }
export async function findWorkingDocker() { return null }
