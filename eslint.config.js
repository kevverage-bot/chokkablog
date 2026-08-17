import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // The Edge Functions are TypeScript, but they are not this project's
  // TypeScript: they run on Deno, import from URLs, use Deno globals, and are
  // checked by `deno lint`/`supabase functions deploy` rather than by the rules
  // below (which assume a browser and React). Linting them here only produces
  // errors about a platform they do not run on.
  globalIgnores(['dist', 'supabase/functions']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
])
