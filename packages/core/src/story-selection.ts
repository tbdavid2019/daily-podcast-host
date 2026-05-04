import { DEFAULT_STORY_LIMITS, DEFAULT_TIMEZONE_OFFSET, SOURCE_PRIORITY } from './config.js'
import type { GeneratedScriptData, StorySource } from './types.js'

export function applyStoryBudget(
  limits: Record<string, number>,
  budget: number,
  priorityOrder: readonly string[] = SOURCE_PRIORITY,
) {
  const result: Record<string, number> = { ...limits }
  let total = Object.values(result).reduce((sum, value) => sum + Math.max(0, value || 0), 0)

  if (total <= budget) {
    return result
  }

  for (const source of [...priorityOrder].reverse()) {
    let value = Math.max(0, result[source] || 0)
    while (value > 0 && total > budget) {
      value -= 1
      total -= 1
    }
    result[source] = value
    if (total <= budget) {
      return result
    }
  }

  for (const key of Object.keys(result)) {
    if (priorityOrder.includes(key)) {
      continue
    }
    let value = Math.max(0, result[key] || 0)
    while (value > 0 && total > budget) {
      value -= 1
      total -= 1
    }
    result[key] = value
    if (total <= budget) {
      break
    }
  }

  return result
}

export function getStoryLimitsForDate(displayDate: string, maxStoryBudget?: number) {
  const dayOfWeek = new Date(displayDate).getDay()
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
  const limits: Record<StorySource, number> = {
    ...DEFAULT_STORY_LIMITS,
    'hacker-news': isWeekend ? 6 : 7,
    'github-trending': dayOfWeek === 1 || dayOfWeek === 4 ? 2 : 0,
    'product-hunt': dayOfWeek === 2 || dayOfWeek === 5 ? 2 : 0,
    'dev-to': dayOfWeek === 3 ? 3 : 0,
  }

  if (!maxStoryBudget || maxStoryBudget <= 0) {
    return limits
  }

  return applyStoryBudget(limits, maxStoryBudget, SOURCE_PRIORITY) as Record<StorySource, number>
}

export function getRecentDates(baseDate: string, days: number) {
  const base = new Date(`${baseDate}T00:00:00Z`)
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(base)
    date.setUTCDate(date.getUTCDate() - (index + 1))
    return date.toISOString().split('T')[0]
  })
}

export function collectExcludedRedditIds(recentScripts: Array<GeneratedScriptData | null | undefined>) {
  const ids = new Set<string>()
  for (const scriptData of recentScripts) {
    for (const story of scriptData?.stories || []) {
      if (story?.source === 'reddit' && story.id) {
        ids.add(story.id)
      }
    }
  }
  return ids
}

export function getDisplayDate(now = new Date(), timezoneOffset = DEFAULT_TIMEZONE_OFFSET) {
  const localTime = new Date(now.getTime() + timezoneOffset * 60 * 60 * 1000)
  return localTime.toISOString().split('T')[0]
}
