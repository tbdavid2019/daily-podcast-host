import { notFound } from 'next/navigation'
import { getEpisodeArticle } from '@/lib/runtime'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string; variant: string }>
}) {
  const { date, variant } = await params
  const post = await getEpisodeArticle(date, variant)
  if (!post) {
    return {}
  }

  return {
    title: post.title,
    description: post.introContent,
  }
}

export default async function VariantPage({
  params,
}: {
  params: Promise<{ date: string; variant: string }>
}) {
  const { date, variant } = await params
  const post = await getEpisodeArticle(date, variant)
  if (!post) {
    notFound()
  }

  return (
    <main style={{ margin: '0 auto', maxWidth: 880, padding: '40px 20px', fontFamily: 'Georgia, serif' }}>
      <h1 style={{ fontSize: 36 }}>{post.title}</h1>
      <p style={{ color: '#666' }}>Variant: {variant}</p>
      <audio controls preload="none" style={{ width: '100%', margin: '24px 0' }}>
        <source src={`/static/${post.audio}`} type="audio/mpeg" />
      </audio>
      <article style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>{post.blogContent}</article>
    </main>
  )
}
