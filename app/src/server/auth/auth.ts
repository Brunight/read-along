import { betterAuth } from 'better-auth'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { drizzleAdapter } from '@better-auth/drizzle-adapter/relations-v2'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import * as schema from '../db/schema'
import { authEnabled, checkAuthConfig, publicUrl } from './config'
import { adminPlugin, schemaOptions } from './options'

const YEAR = 60 * 60 * 24 * 365
const DAY = 60 * 60 * 24

function createAuth() {
  checkAuthConfig()
  return betterAuth({
    ...schemaOptions,
    baseURL: publicUrl,
    database: drizzleAdapter(db, { provider: 'sqlite', schema }),
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        prompt: 'select_account',
        // Keep name and picture in sync with the Google account.
        overrideUserInfoOnSignIn: true,
      },
    },
    session: { expiresIn: YEAR, updateAge: DAY },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const email = user.email.toLowerCase()
            const pre = await db.select().from(schema.preApprovedEmails).where(eq(schema.preApprovedEmails.email, email)).get()
            return pre ? { data: { ...user, status: 'approved' } } : undefined
          },
          after: async (user) => {
            await db.delete(schema.preApprovedEmails).where(eq(schema.preApprovedEmails.email, user.email.toLowerCase()))
          },
        },
      },
    },
    // Must be last: writes better-auth's cookies onto TanStack Start responses.
    plugins: [adminPlugin, tanstackStartCookies()],
  })
}

export const auth = authEnabled ? createAuth() : null
