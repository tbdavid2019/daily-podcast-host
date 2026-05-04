import * as cheerio from 'cheerio'
import type { Story } from '../../../packages/core/src/types.js'

type StorySource = NonNullable<Story['source']>

interface StoryFetchOptions {
  limits?: Partial<Record<StorySource, number>>
  excludeRedditIds?: Set<string>
}

const breakerState = {
  jinaFailures: 0,
  firecrawlFailures: 0,
}

const BREAKER_THRESHOLD = 2

const SELF_HOSTED_JINA_NODES = [
  'https://create360.ai',
  'http://git.glsoft.ai:8083',
]

interface FetchEnv {
  jinaKey?: string
  firecrawlKey?: string
}

async function getContentFromJina(url: string, format: 'html' | 'markdown', selector?: { include?: string, exclude?: string }, jinaKey?: string) {
  if (breakerState.jinaFailures >= BREAKER_THRESHOLD) {
    return ''
  }

  const headers: HeadersInit = {
    'X-Retain-Images': 'none',
    'X-Return-Format': format,
  }

  if (jinaKey) {
    headers.Authorization = `Bearer ${jinaKey}`
  }
  if (selector?.include) {
    headers['X-Target-Selector'] = selector.include
  }
  if (selector?.exclude) {
    headers['X-Remove-Selector'] = selector.exclude
  }

  for (const node of SELF_HOSTED_JINA_NODES) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000)
      const response = await fetch(`${node}/${url}`, {
        headers,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      if (response.ok) {
        breakerState.jinaFailures = 0
        return response.text()
      }
    }
    catch {}
  }

  breakerState.jinaFailures += 1
  return ''
}

async function getContentFromFirecrawl(url: string, format: 'html' | 'markdown', selector?: { include?: string, exclude?: string }, firecrawlKey?: string) {
  if (!firecrawlKey || breakerState.firecrawlFailures >= BREAKER_THRESHOLD) {
    return ''
  }

  const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${firecrawlKey}`,
    },
    body: JSON.stringify({
      url,
      formats: [format],
      onlyMainContent: true,
      include_tags: selector?.include ? [selector.include] : undefined,
      exclude_tags: selector?.exclude ? [selector.exclude] : undefined,
    }),
  })

  if (response.ok) {
    breakerState.firecrawlFailures = 0
    const result = await response.json() as { success: boolean; data: Record<string, string> }
    if (result.success) {
      return result.data[format] || ''
    }
  }

  if (response.status === 402 || response.status === 429) {
    breakerState.firecrawlFailures += 1
  }
  return ''
}

async function fetchTextContent(url: string, format: 'html' | 'markdown', env: FetchEnv, selector?: { include?: string, exclude?: string }) {
  let content = await getContentFromJina(url, format, selector, env.jinaKey)
  if (content?.trim().length) {
    return content
  }
  content = await getContentFromFirecrawl(url, format, selector, env.firecrawlKey)
  return content
}

export async function getHackerNewsTopStories(today: string, env: FetchEnv) {
  try {
    const response = await fetch('https://news.ycombinator.com/rss')
    const rssText = await response.text()
    const $ = cheerio.load(rssText, { xmlMode: true })
    const items = $('item')
    const stories = items.map((_, el) => {
      const item = $(el)
      const link = item.find('link').text()
      const title = item.find('title').text()
      const commentsLink = item.find('comments').text()
      const idMatch = commentsLink.match(/id=(\d+)/)
      return {
        id: idMatch ? idMatch[1] : '',
        title,
        url: link,
        hackerNewsUrl: commentsLink,
        source: 'hacker-news' as const,
        sourceUrl: commentsLink,
      } satisfies Story
    }).get().filter((story) => story.id && story.title && story.url)

    if (stories.length > 0) {
      return stories
    }
  }
  catch {}

  const html = await fetchTextContent(`https://news.ycombinator.com/front?day=${today}`, 'html', env)
  const $ = cheerio.load(html)
  return $('.athing.submission').map((_, el) => ({
    id: $(el).attr('id') || '',
    title: $(el).find('.titleline > a').text(),
    url: $(el).find('.titleline > a').attr('href') || '',
    hackerNewsUrl: `https://news.ycombinator.com/item?id=${$(el).attr('id')}`,
    source: 'hacker-news' as const,
    sourceUrl: `https://news.ycombinator.com/item?id=${$(el).attr('id')}`,
  } satisfies Story)).get().filter((story) => story.id && story.title && story.url)
}

export async function getGitHubTrendingStories(env: FetchEnv) {
  const html = await fetchTextContent('https://github.com/trending', 'html', env)
  const $ = cheerio.load(html)
  const repos = $('.Box-row').map((index, el) => {
    const titleLink = $(el).find('h2 a')
    const href = titleLink.attr('href')
    const repoName = href?.replace('/', '') || ''
    const title = titleLink.text().trim()
    const description = $(el).find('p').text().trim()
    const starsText = $(el).find('.octicon-star').parent().text().trim().replace(/,/g, '')
    const stars = Number.parseInt(starsText || '0', 10)

    if (!href || !repoName || !title) {
      return null
    }

    return {
      id: repoName.replace('/', '-'),
      title: `${title} (${stars} ⭐)`,
      url: `https://github.com${href}`,
      source: 'github-trending' as const,
      sourceUrl: `https://github.com${href}`,
      description,
      stars,
    } satisfies Story
  }).get().filter(Boolean) as Story[]

  return repos.slice(0, 10)
}

export async function getProductHuntStories(env: FetchEnv) {
  try {
    const response = await fetch('https://www.producthunt.com/feed', {
      headers: {
        'User-Agent': 'DailyPodcast/1.0 (for tech news aggregation)',
      },
    })
    if (response.ok) {
      const rssText = await response.text()
      const $ = cheerio.load(rssText, { xmlMode: true })
      const entries = $('entry')
      const stories = entries.map((index, el) => {
        const title = $(el).find('title').text().trim()
        const link = $(el).find('link').attr('href')
        const content = $(el).find('content').text()
        const id = $(el).find('id').text()
        if (!title || !link) {
          return null
        }
        const contentText = cheerio.load(content).text().trim().substring(0, 200)
        return {
          id: id.split('/').pop() || `ph-rss-${index}`,
          title,
          url: link,
          source: 'product-hunt' as const,
          sourceUrl: link,
          description: contentText,
        } satisfies Story
      }).get().filter(Boolean) as Story[]

      if (stories.length > 0) {
        return stories.slice(0, 5)
      }
    }
  }
  catch {}

  const html = await fetchTextContent('https://www.producthunt.com', 'html', env)
  const $ = cheerio.load(html)
  return $('[data-test*="post-item"]').map((index, el) => {
    const firstLink = $(el).find('a').first()
    const href = firstLink.attr('href')
    const title = firstLink.text().trim().replace(/^\d+\.\s*/, '')
    const votesText = $(el).find('[data-test*="vote-button"]').text().trim()
    const votes = Number.parseInt(votesText || '0', 10)
    let description = $(el).find('[data-test*="post-description"]').text().trim()
    if (!description) {
      description = $(el).find('.text-sm, .description, p').first().text().trim()
    }
    if (!href || !title) {
      return null
    }
    const fullUrl = href.startsWith('http') ? href : `https://www.producthunt.com${href}`
    return {
      id: href.split('/').pop() || `ph-${index}`,
      title: `${title} (${votes} 👍)`,
      url: fullUrl,
      source: 'product-hunt' as const,
      sourceUrl: fullUrl,
      description,
      votes,
    } satisfies Story
  }).get().filter(Boolean).slice(0, 5) as Story[]
}

export async function getDevToStories(env: FetchEnv) {
  try {
    const response = await fetch('https://dev.to/feed')
    if (response.ok) {
      const rssText = await response.text()
      const $ = cheerio.load(rssText, { xmlMode: true })
      const stories = $('item').map((index, el) => {
        const title = $(el).find('title').text()
        const link = $(el).find('link').text()
        const author = $(el).find('dc\\:creator').text() || $(el).find('creator').text()
        const categories = $(el).find('category').map((_, c) => $(c).text()).get().join(', ')
        if (!title || !link) {
          return null
        }
        return {
          id: link.split('/').pop() || `dev-rss-${index}`,
          title: `${title} by ${author}`,
          url: link,
          source: 'dev-to' as const,
          sourceUrl: link,
          description: categories,
        } satisfies Story
      }).get().filter(Boolean) as Story[]
      if (stories.length > 0) {
        return stories.slice(0, 10)
      }
    }
  }
  catch {}

  const html = await fetchTextContent('https://dev.to/top/week', 'html', env)
  const $ = cheerio.load(html)
  return $('.crayons-story').map((index, el) => {
    const titleLink = $(el).find('.crayons-story__title a')
    const title = titleLink.text().trim()
    const href = titleLink.attr('href')
    const description = $(el).find('.crayons-story__tags').text().trim()
    const author = $(el).find('.crayons-story__secondary .crayons-link').first().text().trim()
    if (!title || !href) {
      return null
    }
    return {
      id: href.split('/').pop() || `dev-${index}`,
      title: `${title} by ${author}`,
      url: href.startsWith('http') ? href : `https://dev.to${href}`,
      source: 'dev-to' as const,
      sourceUrl: href.startsWith('http') ? href : `https://dev.to${href}`,
      description,
    } satisfies Story
  }).get().filter(Boolean).slice(0, 10) as Story[]
}

export async function getRedditStories(_env: FetchEnv, options: { excludeRedditIds?: Set<string> } = {}) {
  const { excludeRedditIds } = options
  const subreddits = ['LocalLLaMA', 'coding', 'netsec', 'sysadmin', 'dataengineering']
  const sortMethods = ['hot', 'rising', 'top']
  const selectedSort = sortMethods[Math.floor(Math.random() * sortMethods.length)]
  const timeQuery = selectedSort === 'top' ? '&t=day' : ''
  const bySubreddit: Record<string, Story[]> = {}

  for (const subreddit of subreddits) {
    try {
      const response = await fetch(`https://www.reddit.com/r/${subreddit}/${selectedSort}/.json?limit=10${timeQuery}`, {
        headers: {
          'User-Agent': 'DailyPodcast/1.0 (for tech news aggregation)',
        },
      })
      if (!response.ok) {
        continue
      }
      const result = await response.json() as { data?: { children?: Array<{ data?: Record<string, unknown> }> } }
      const stories = (result.data?.children || []).map(({ data }) => {
        const title = String(data?.title || '')
        const id = String(data?.id || '')
        const permalink = String(data?.permalink || '')
        const url = String(data?.url || '')
        const upvotes = Number(data?.ups || 0)
        if (!title || !id || !url || (excludeRedditIds?.has(id))) {
          return null
        }
        return {
          id,
          title,
          url,
          source: 'reddit' as const,
          sourceUrl: permalink ? `https://www.reddit.com${permalink}` : url,
          upvotes,
          subreddit,
        } satisfies Story
      }).filter(Boolean) as Story[]

      bySubreddit[subreddit] = stories.slice(0, 3)
    }
    catch {}
  }

  return Object.values(bySubreddit).flat().slice(0, 6)
}

export async function getAllStories(today: string, env: FetchEnv, options: StoryFetchOptions = {}) {
  const { limits = {}, excludeRedditIds } = options
  const shouldFetchSource = (source: StorySource) => limits[source] === undefined || limits[source]! > 0

  const [hackerNewsStories, githubStories, productHuntStories, devToStories, redditStories] = await Promise.all([
    shouldFetchSource('hacker-news') ? getHackerNewsTopStories(today, env).catch(() => []) : Promise.resolve([]),
    shouldFetchSource('github-trending') ? getGitHubTrendingStories(env).catch(() => []) : Promise.resolve([]),
    shouldFetchSource('product-hunt') ? getProductHuntStories(env).catch(() => []) : Promise.resolve([]),
    shouldFetchSource('dev-to') ? getDevToStories(env).catch(() => []) : Promise.resolve([]),
    shouldFetchSource('reddit') ? getRedditStories(env, { excludeRedditIds }).catch(() => []) : Promise.resolve([]),
  ])

  const applyLimit = (stories: Story[], source: StorySource) => {
    const limit = limits[source]
    return typeof limit === 'number' ? stories.slice(0, limit) : stories
  }

  return [
    ...applyLimit(hackerNewsStories, 'hacker-news'),
    ...applyLimit(githubStories, 'github-trending'),
    ...applyLimit(productHuntStories, 'product-hunt'),
    ...applyLimit(devToStories, 'dev-to'),
    ...applyLimit(redditStories, 'reddit'),
  ]
}

export async function getStoryContent(story: Story, maxTokens: number, env: FetchEnv) {
  if (story.source === 'hacker-news') {
    const article = await fetchTextContent(story.url || '', 'markdown', env)
    const comments = await fetchTextContent(
      `https://news.ycombinator.com/item?id=${story.id}`,
      'markdown',
      env,
      { include: '#pagespace + tr', exclude: '.navs' },
    )

    if ((article.trim().length + comments.trim().length) < 50) {
      return ''
    }

    return [
      story.title ? `<title>${story.title}</title>` : '',
      article.trim() ? `<article>${article.substring(0, maxTokens * 4)}</article>` : '',
      comments.trim() ? `<comments>${comments.substring(0, maxTokens * 4)}</comments>` : '',
    ].filter(Boolean).join('\n\n---\n\n')
  }

  if (story.source === 'reddit') {
    let article = ''
    let comments = ''
    const sourceUrl = story.sourceUrl?.replace(/\/$/, '') || ''
    if (sourceUrl) {
      try {
        const response = await fetch(`${sourceUrl}.json?sort=top&limit=30`, {
          headers: {
            'User-Agent': 'DailyPodcast/1.0 (for tech news aggregation)',
          },
        })
        if (response.ok) {
          const json = await response.json() as Array<{ data?: { children?: Array<{ data?: Record<string, unknown> }> } }>
          const postData = json[0]?.data?.children?.[0]?.data
          if (postData?.is_self && postData.selftext) {
            article = String(postData.selftext)
          }
          comments = (json[1]?.data?.children || [])
            .filter((item) => item?.data?.body)
            .map((item) => `- ${String(item.data?.body || '').replace(/\s+/g, ' ').trim()}`)
            .filter(Boolean)
            .slice(0, 20)
            .join('\n')
        }
      }
      catch {}
    }
    if (!article && story.url) {
      article = await fetchTextContent(story.url, 'markdown', env)
    }
    if ((article.trim().length + comments.trim().length) < 50) {
      return ''
    }
    return [
      story.title ? `<title>${story.title}</title>` : '',
      article.trim() ? `<article>${article.substring(0, maxTokens * 4)}</article>` : '',
      comments.trim() ? `<comments>${comments.substring(0, maxTokens * 4)}</comments>` : '',
    ].filter(Boolean).join('\n\n---\n\n')
  }

  const article = await fetchTextContent(story.url || '', 'markdown', env)
  if (article.trim().length < 50) {
    return ''
  }

  return [
    story.title ? `<title>${story.title}</title>` : '',
    story.description ? `<description>${story.description}</description>` : '',
    story.source ? `<source>${story.source}</source>` : '',
    `<article>${article.substring(0, maxTokens * 4)}</article>`,
  ].filter(Boolean).join('\n\n---\n\n')
}
