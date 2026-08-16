/**
 * The interactive tools, each on its own subdomain or site.
 *
 * These are separate applications, not pages of this one, so they are plain
 * external links. Kept in one place because they appear on the home page now and
 * will appear in a Tools section and in post footers later.
 *
 * `wip` marks a tool that exists but is not ready to be sent traffic: it renders
 * as text rather than a link, so nothing here silently becomes a dead end.
 */
export interface Tool {
  name: string
  description: string
  url: string
  wip?: boolean
}

export const TOOLS: Tool[] = [
  {
    name: 'Pooling & Sharing',
    description: 'UK regional fiscal transfers',
    url: 'https://cra.chokkablog.com',
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
  },
  {
    name: 'CfD Mapping',
    description: 'Contracts for difference analysis',
    url: 'https://www.cfd-hub.com/',
  },
]
