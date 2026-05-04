import { S3Client as AwsS3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { Pool } from 'pg'
import { mapScriptToArticle } from '../../../../packages/core/src/article.js'
import { PostgresEpisodeStore } from '../../../../packages/storage/src/postgres.js'
import { S3AudioStore } from '../../../../packages/storage/src/s3.js'
import type { AudioRangeRequest } from '../../../../packages/storage/src/types.js'
import { getWebEnv } from './env.js'

let runtime: ReturnType<typeof createRuntime> | undefined

export function getRuntime() {
  runtime ||= createRuntime()
  return runtime
}

function createRuntime() {
  const env = getWebEnv()
  const pool = new Pool({
    connectionString: env.databaseUrl,
  })

  const postgres = new PostgresEpisodeStore({
    async query<T>(sql: string, params?: unknown[]) {
      const result = await pool.query(sql, params)
      return {
        rows: result.rows as T[],
      }
    },
  })

  const s3 = new S3AudioStore(
    {
      async putObject() {
        throw new Error('Web runtime does not write audio objects')
      },
      async getObject(input) {
        const client = getS3Client(env)
        const result = await client.send(new GetObjectCommand({
          Bucket: input.bucket,
          Key: input.key,
          Range: input.range,
        }))

        if (!result.Body) {
          return null
        }

        const body = new Uint8Array(await result.Body.transformToByteArray())
        return {
          body,
          contentType: result.ContentType,
          contentLength: result.ContentLength || body.byteLength,
          contentRange: result.ContentRange,
          etag: result.ETag,
        }
      },
      async headObject(input) {
        try {
          const client = getS3Client(env)
          const result = await client.send(new HeadObjectCommand({
            Bucket: input.bucket,
            Key: input.key,
          }))
          return {
            contentType: result.ContentType,
            contentLength: result.ContentLength || 0,
            etag: result.ETag,
          }
        }
        catch {
          return null
        }
      },
      async deleteObject() {
        throw new Error('Web runtime does not delete audio objects')
      },
    },
    env.s3Bucket,
  )

  return {
    env,
    episodes: postgres,
    runs: postgres,
    audio: s3,
  }
}

function getS3Client(env: ReturnType<typeof getWebEnv>) {
  return new AwsS3Client({
    endpoint: env.s3Endpoint,
    region: env.s3Region,
    forcePathStyle: env.s3ForcePathStyle,
    credentials: {
      accessKeyId: env.s3AccessKey,
      secretAccessKey: env.s3SecretKey,
    },
  })
}

export async function getHomepageArticles(limit = 10, variant = 'hacker-news') {
  const { env, episodes } = getRuntime()
  const records = await episodes.listEpisodes(env.runEnv, variant, limit)
  return records.map((record) =>
    mapScriptToArticle(
      {
        title: record.title,
        dialogue: record.dialogue,
        blogContent: record.blogContent,
        introContent: record.introContent,
        stories: record.stories,
        storySummaries: record.storySummaries,
        displayDate: record.date,
        generatedAt: record.generatedAt,
      },
      env.runEnv,
      variant,
    ),
  ).filter(Boolean)
}

export async function getEpisodeArticle(date: string, variant = 'hacker-news') {
  const { env, episodes } = getRuntime()
  const record = await episodes.getEpisode({
    env: env.runEnv,
    variant,
    date,
  })

  if (!record) {
    return null
  }

  return mapScriptToArticle(
    {
      title: record.title,
      dialogue: record.dialogue,
      blogContent: record.blogContent,
      introContent: record.introContent,
      stories: record.stories,
      storySummaries: record.storySummaries,
      displayDate: record.date,
      generatedAt: record.generatedAt,
    },
    env.runEnv,
    variant,
  )
}

export async function getAudioObject(path: string, range?: AudioRangeRequest) {
  return getRuntime().audio.getAudio(path, range)
}

export async function headAudioObject(path: string) {
  return getRuntime().audio.headAudio(path)
}
