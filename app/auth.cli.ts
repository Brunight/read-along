/**
 * Only for `bun run auth:generate`, which writes src/server/db/auth-schema.ts from this config.
 * The real instance is in src/server/auth/auth.ts.
 */
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from '@better-auth/drizzle-adapter/relations-v2'
import { schemaOptions } from './src/server/auth/options'

export const auth = betterAuth({
  ...schemaOptions,
  database: drizzleAdapter({}, { provider: 'sqlite' }),
  socialProviders: { google: { clientId: '', clientSecret: '' } },
})
