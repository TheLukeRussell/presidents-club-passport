// The one place that knows where the data comes from. Today it's a static
// JSON file next to the app, shaped like the tracking sheet's two tabs. To
// read the sheet straight from SharePoint later, change this file and nothing
// else: the UI only ever sees PassportData.

import { cleanData } from '../lib/sheet'
import type { PassportData } from './types'

const DATA_PATH = 'data/passport.json'
// `npm run import` writes a real export here. It's gitignored, and only the
// dev server will read it (add ?data=local before the #), so real names can
// be checked locally without ever going near the public site.
const LOCAL_PATH = 'data/local.json'

const readsLocal = () => import.meta.env.DEV && new URLSearchParams(window.location.search).get('data') === 'local'

export const dataPath = () => (readsLocal() ? LOCAL_PATH : DATA_PATH)

export class DataError extends Error {}

const list = (value: unknown) => (Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null) : null)

export async function loadData(signal?: AbortSignal): Promise<PassportData> {
  const path = dataPath()
  let response: Response
  try {
    // BASE_URL carries Vite's base path (/presidents-club-passport/) in dev
    // and on Pages, so this works in both.
    response = await fetch(`${import.meta.env.BASE_URL}${path}`, { signal, cache: 'no-cache' })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new DataError('The passport data didn’t come back. Check the connection and try again.')
  }
  if (!response.ok) {
    throw new DataError(`The server answered ${response.status} when asked for ${path}.`)
  }
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new DataError(`${path} isn’t valid JSON, so there’s nothing to show.`)
  }
  const reps = list((body as { reps?: unknown } | null)?.reps)
  const stamps = list((body as { stamps?: unknown } | null)?.stamps)
  if (!reps || !stamps) throw new DataError(`${path} should have a list of reps and a list of stamps.`)
  const { data, problems } = cleanData(reps, stamps)
  if (problems.length && import.meta.env.DEV) console.warn(`${path}: ${problems.length} rows skipped or fixed\n${problems.join('\n')}`)
  return data
}
