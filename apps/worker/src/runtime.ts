import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client as AwsS3Client } from '@aws-sdk/client-s3'
import { Pool } from 'pg'
import IORedis from 'ioredis'
import { PostgresEpisodeStore } from '../../../packages/storage/src/postgres.js'
import { RedisWorkflowStateStore } from '../../../packages/storage/src/redis.js'
import { S3AudioStore } from '../../../packages/storage/src/s3.js'
import { getWorkerEnv } from './config.js'

let runtime: ReturnType<typeof createRuntime> | undefined

export function getRuntime() {
  runtime ||= createRuntime()
  return runtime
}

function createRuntime() {
  const env = getWorkerEnv()
  const pool = new Pool({
    connectionString: env.databaseUrl,
  })
  const RedisClient = IORedis as unknown as new (
    url: string,
    options: { maxRetriesPerRequest: null }
  ) => {
    get(key: string): Promise<string | null>
    set(...args: unknown[]): Promise<'OK' | null>
    del(key: string): Promise<number>
    duplicate(): {
      get(key: string): Promise<string | null>
      set(...args: unknown[]): Promise<'OK' | null>
      del(key: string): Promise<number>
      duplicate(): unknown
    }
  }

  const redis = new RedisClient(env.redisUrl, {
    maxRetriesPerRequest: null,
  })

  const postgres = new PostgresEpisodeStore({
    async query<T>(sql: string, params?: unknown[]) {
      const result = await pool.query(sql, params)
      return {
        rows: result.rows as T[],
      }
    },
  })

  const s3Client = new AwsS3Client({
    endpoint: env.s3Endpoint,
    region: env.s3Region,
    forcePathStyle: env.s3ForcePathStyle,
    credentials: {
      accessKeyId: env.s3AccessKey,
      secretAccessKey: env.s3SecretKey,
    },
  })

  const workflowState = new RedisWorkflowStateStore({
    get: (key: string) => redis.get(key),
    async set(key: string, value: string, options?: { ex?: number; nx?: boolean }) {
      if (options?.nx && options?.ex) {
        return redis.set(key, value, 'EX', options.ex, 'NX')
      }
      if (options?.ex) {
        return redis.set(key, value, 'EX', options.ex)
      }
      return redis.set(key, value)
    },
    del: (key: string) => redis.del(key),
  })

  const audio = new S3AudioStore(
    {
      async putObject(input) {
        await s3Client.send(new PutObjectCommand({
          Bucket: input.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
        }))
      },
      async getObject(input) {
        try {
          const result = await s3Client.send(new GetObjectCommand({
            Bucket: input.bucket,
            Key: input.key,
            Range: input.range,
          }))
          if (!result.Body) {
            return null
          }
          return {
            body: new Uint8Array(await result.Body.transformToByteArray()),
            contentLength: result.ContentLength || 0,
            contentRange: result.ContentRange,
            contentType: result.ContentType,
            etag: result.ETag,
          }
        }
        catch {
          return null
        }
      },
      async headObject(input) {
        try {
          const result = await s3Client.send(new HeadObjectCommand({
            Bucket: input.bucket,
            Key: input.key,
          }))
          return {
            contentLength: result.ContentLength || 0,
            contentType: result.ContentType,
            etag: result.ETag,
          }
        }
        catch {
          return null
        }
      },
      async deleteObject(input) {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: input.bucket,
          Key: input.key,
        }))
      },
    },
    env.s3Bucket,
  )

  return {
    env,
    redis,
    pool,
    episodes: postgres,
    runs: postgres,
    workflowState,
    audio,
  }
}
