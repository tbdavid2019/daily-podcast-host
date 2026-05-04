export const podcastTitle = 'DAVID888 Daily 每日放送'
export const DEFAULT_VARIANT = 'hacker-news'
export const DEFAULT_TIMEZONE_OFFSET = 8
export const DEFAULT_STORY_LIMITS: Record<StorySource, number> = {
  'hacker-news': 7,
  'reddit': 3,
  'github-trending': 0,
  'product-hunt': 0,
  'dev-to': 0,
}
export const SOURCE_PRIORITY: readonly StorySource[] = [
  'hacker-news',
  'reddit',
  'product-hunt',
  'github-trending',
  'dev-to',
]

import type { StorySource } from './types.js'
