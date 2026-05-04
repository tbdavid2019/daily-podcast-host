import type { WorkflowStateStore } from './types.js'

export interface RedisClient {
  get(key: string): Promise<string | null>
  set(key: string, value: string, options?: { ex?: number; nx?: boolean }): Promise<'OK' | null>
  del(key: string): Promise<number>
}

export class RedisWorkflowStateStore implements WorkflowStateStore {
  constructor(private readonly client: RedisClient) {}

  getScriptCacheKey(env: string, variant: string, date: string) {
    return `script:${env}:${variant}:${date}`
  }

  getContentCacheKey(env: string, date: string) {
    return `content:${env}:hacker-news:${date}`
  }

  getStoryContentCacheKey(env: string, date: string, source: string) {
    return `${this.getContentCacheKey(env, date)}:story-contents:${source}`
  }

  getWorkflowLockKey(env: string, variant: string, date: string, phase: string) {
    return `workflow:${env}:${variant}:${date}:${phase}`
  }

  getAudioWorkflowLockKey(env: string, variant: string, date: string) {
    return `audio-workflow:${env}:${variant}:${date}`
  }

  async acquireRunLock(key: string, owner: string, ttlSeconds: number) {
    const result = await this.client.set(key, JSON.stringify({ owner, acquiredAt: Date.now() }), {
      ex: ttlSeconds,
      nx: true,
    })
    return result === 'OK'
  }

  async releaseRunLock(key: string) {
    await this.client.del(key)
  }

  async getJson<T>(key: string) {
    const value = await this.client.get(key)
    return value ? (JSON.parse(value) as T) : null
  }

  async setJson(key: string, value: unknown, ttlSeconds?: number) {
    await this.client.set(key, JSON.stringify(value), ttlSeconds ? { ex: ttlSeconds } : undefined)
  }

  async delete(key: string) {
    await this.client.del(key)
  }
}
