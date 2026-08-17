import type { HomeContent } from '../hooks/useHomeContent'
import type { ToolCard } from '../hooks/useTools'

/**
 * The home page as it stands in the code, and what it falls back to.
 *
 * The live wording lives in the database (supabase/005_home.sql) so it can be
 * edited in Admin. These are the same words, kept here for one situation: the
 * deploy that lands before the migration has been run. The tables do not exist
 * yet, the query errors, and without this the front page would be blank until
 * someone opened the SQL editor.
 *
 * ⚠ They are a fallback for a FAILED read, not a default for an empty one. A
 * tools grid that has been deliberately emptied in Admin must stay empty; see
 * the `failed` flag in useTools.
 *
 * Worth keeping in step with the seed values in 005_home.sql, but nothing
 * breaks if they drift — the database wins the moment it answers.
 */
export const FALLBACK_HOME_CONTENT: HomeContent = {
  badge: 'Coming soon',
  intro:
    'Data-driven analysis of Scotland’s economy and the case being made for ' +
    'Scottish independence.',
  tools_heading: 'Tools',
}

export const FALLBACK_TOOLS: ToolCard[] = [
  {
    name: 'Pooling & Sharing',
    description: 'UK regional fiscal transfers',
    url: 'https://cra.chokkablog.com',
    wip: false,
  },
  {
    name: 'GERS Explorer',
    description: 'Revenue, spending & deficit',
    url: 'https://gers-explorer.com',
    wip: true,
  },
  {
    name: 'OECD Benchmarks',
    description: 'International comparisons',
    url: 'https://oecd.chokkablog.com',
    wip: false,
  },
  {
    name: 'CfD Mapping',
    description: 'Contracts for difference analysis',
    url: 'https://www.cfd-hub.com/',
    wip: false,
  },
]
