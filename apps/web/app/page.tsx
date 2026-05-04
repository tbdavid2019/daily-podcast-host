import Link from 'next/link'
import { getHomepageArticles } from '@/lib/runtime'

export const revalidate = 600

export default async function HomePage() {
  const posts = await getHomepageArticles(12, 'hacker-news')
  type HomePost = NonNullable<(typeof posts)[number]>

  return (
    <main style={{ margin: '0 auto', maxWidth: 880, padding: '40px 20px', fontFamily: 'Georgia, serif' }}>
      <h1 style={{ fontSize: 40, marginBottom: 12 }}>DAVID888 Daily 每日放送</h1>
      <p style={{ marginBottom: 32, color: '#555' }}>Self-hosted Linux runtime backed by Postgres and MinIO.</p>
      <div style={{ display: 'grid', gap: 24 }}>
        {posts.filter((post): post is HomePost => Boolean(post)).map((post) => (
          <article key={`${post?.date}-${post?.variant}`} style={{ borderBottom: '1px solid #ddd', paddingBottom: 20 }}>
            <h2 style={{ margin: '0 0 8px 0', fontSize: 28 }}>
              <Link href={`/post/${post?.date}/${post?.variant}`}>{post?.title}</Link>
            </h2>
            <p style={{ margin: 0, color: '#666' }}>{post?.introContent}</p>
          </article>
        ))}
      </div>
    </main>
  )
}
