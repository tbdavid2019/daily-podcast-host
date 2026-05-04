import { NextResponse } from 'next/server'
import { Podcast } from 'podcast'
import { getHomepageArticles, getRuntime, headAudioObject } from '@/lib/runtime'

export const revalidate = 600

export async function GET() {
  const { env } = getRuntime()
  const feed = new Podcast({
    title: 'DAVID888 Daily 每日放送',
    description: 'Self-hosted daily tech podcast feed.',
    feedUrl: `${env.baseUrl}/rss.xml`,
    siteUrl: env.baseUrl,
    imageUrl: `${env.baseUrl}/podcast-cover.png`,
    language: 'zh-CN',
    pubDate: new Date(),
    ttl: 60,
  })

  const posts = await getHomepageArticles(10, 'hacker-news')

  for (const post of posts) {
    if (!post) {
      continue
    }

    const audio = await headAudioObject(post.audio)
    if (!audio) {
      continue
    }

    feed.addItem({
      title: post.title,
      description: post.introContent,
      url: `${env.baseUrl}/post/${post.date}/${post.variant}`,
      guid: `${env.baseUrl}/post/${post.date}/${post.variant}`,
      date: new Date(post.updatedAt),
      enclosure: {
        url: `${env.staticHost}/${post.audio}?t=${post.updatedAt}`,
        type: audio.contentType || 'audio/mpeg',
        size: audio.size,
      },
    })
  }

  return new NextResponse(feed.buildXml(), {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': `public, max-age=${revalidate}, s-maxage=${revalidate}`,
    },
  })
}
