import { admin } from 'better-auth/plugins'

/** Roles and bans. Listed directly in each config's `plugins` so its user fields are inferred. */
export const adminPlugin = admin()

/**
 * The parts of the better-auth config that shape the database schema. Kept free of env and
 * database imports so `bun run auth:generate` (auth.cli.ts) can load it on its own.
 */
export const schemaOptions = {
  user: {
    additionalFields: {
      /** New Google accounts wait for an admin ("pending"); pre-added emails start "approved". */
      status: { type: 'string' as const, required: true, defaultValue: 'pending', input: false },
      /** false: only the series listed in user_series are visible. */
      allSeries: { type: 'boolean' as const, required: true, defaultValue: true, input: false },
      /** Name the user picked in Settings; shown instead of `name`, which Google overwrites on sign-in. */
      nickname: { type: 'string' as const, required: false, input: false },
    },
  },
  plugins: [adminPlugin],
}
