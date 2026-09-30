import { definePlugin } from 'nitro'
import { checkAuthConfig } from '../auth/config'
import { ensureSetupToken } from '../auth/setup'

// Runs once when the server boots: opening the database applies migrations, then the
// first-admin link is printed if login is on and nobody is admin yet.
export default definePlugin(() => {
  try {
    checkAuthConfig()
  } catch (e) {
    console.error((e as Error).message)
    process.exit(1)
  }
  ensureSetupToken()
})
