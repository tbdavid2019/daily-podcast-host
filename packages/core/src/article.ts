import type { ArticleRecord, GeneratedScriptData } from './types.js'

const ONE_DAY = 24 * 60 * 60 * 1000

export function getArticleTimestamp(articleDate: string, fallback?: number) {
  if (typeof fallback === 'number' && Number.isFinite(fallback)) {
    return fallback
  }

  const parsed = Date.parse(`${articleDate}T00:00:00+08:00`)
  return Number.isNaN(parsed) ? Date.now() : parsed
}

export function getPastDays(days: number, timezoneOffset = 8) {
  return Array.from({ length: days }, (_, index) => {
    const now = new Date()
    const localTime = new Date(now.getTime() + timezoneOffset * 60 * 60 * 1000)
    const targetTime = new Date(localTime.getTime() - index * ONE_DAY)
    return targetTime.toISOString().split('T')[0]
  })
}

export function mapScriptToArticle(
  data: GeneratedScriptData,
  runEnv: string,
  variant = 'hacker-news',
): ArticleRecord | null {
  if (!data) {
    return null
  }

  const audioPath = `${data.displayDate.replaceAll('-', '/')}/${runEnv}/${variant}-${data.displayDate}.mp3`
  const podcastContent = Array.isArray(data.dialogue)
    ? data.dialogue.map((line) => `${line.speaker}: ${line.text}`).join('\n\n')
    : ''

  let finalTitle = data.title

  if (!finalTitle) {
    const storyTitles = (data.stories || [])
      .slice(0, 3)
      .map((story) => story.title)
      .filter(Boolean)
      .join(' | ')

    finalTitle = storyTitles
      ? `[備用標題] ${data.displayDate} | ${storyTitles}`
      : `[備用標題] ${data.displayDate}`
  }

  return {
    title: finalTitle,
    date: data.displayDate,
    updatedAt: getArticleTimestamp(data.displayDate, data.generatedAt),
    introContent: data.introContent,
    blogContent: data.blogContent,
    podcastContent,
    stories: data.stories || [],
    audio: audioPath,
    variant,
  }
}
