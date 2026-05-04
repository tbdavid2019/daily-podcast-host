/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  rewrites: async () => [
    {
      source: '/blog.xml',
      destination: '/rss.xml',
    },
  ],
}

export default nextConfig
