export interface PodcastDialogueLine {
  speaker: '男' | '女'
  text: string
}

export interface Story {
  id?: string
  title?: string
  url?: string
  content?: string
  summary?: string
  source?: 'hacker-news' | 'github-trending' | 'product-hunt' | 'dev-to' | 'reddit'
  sourceUrl?: string
  score?: number
  comments?: number
  time?: number
  description?: string
  votes?: number
  stars?: number
  upvotes?: number
  subreddit?: string
  hackerNewsUrl?: string
}

export interface EpisodeRecord {
  env: string
  variant: string
  date: string
  title: string
  introContent: string
  blogContent: string
  dialogue: PodcastDialogueLine[]
  stories: Story[]
  storySummaries: string[]
  generatedAt: number
}

export interface EpisodeLookup {
  env: string
  variant: string
  date: string
}

export interface RunHistoryRecord {
  env: string
  variant: string
  date: string
  phase: 'script' | 'audio'
  status: 'queued' | 'running' | 'completed' | 'failed'
  attempts: number
  errorMessage?: string
  createdAt: number
  updatedAt: number
}

export interface RunLock {
  key: string
  owner: string
  expiresAt: number
}

export interface AudioObjectDescriptor {
  key: string
  contentType: string
  size: number
  etag?: string
}

export interface AudioRangeRequest {
  start?: number
  end?: number
}

export interface AudioObjectBody extends AudioObjectDescriptor {
  body: Uint8Array
  range?: {
    start: number
    end: number
    total: number
  }
}

export interface EpisodeStore {
  saveEpisode(record: EpisodeRecord): Promise<void>
  getEpisode(lookup: EpisodeLookup): Promise<EpisodeRecord | null>
  listEpisodes(env: string, variant: string, limit: number): Promise<EpisodeRecord[]>
}

export interface RunHistoryStore {
  saveRun(record: RunHistoryRecord): Promise<void>
  getRun(env: string, variant: string, date: string, phase: RunHistoryRecord['phase']): Promise<RunHistoryRecord | null>
}

export interface WorkflowStateStore {
  getScriptCacheKey(env: string, variant: string, date: string): string
  getContentCacheKey(env: string, date: string): string
  getStoryContentCacheKey(env: string, date: string, source: string): string
  getWorkflowLockKey(env: string, variant: string, date: string, phase: string): string
  getAudioWorkflowLockKey(env: string, variant: string, date: string): string
  acquireRunLock(key: string, owner: string, ttlSeconds: number): Promise<boolean>
  releaseRunLock(key: string): Promise<void>
  getJson<T>(key: string): Promise<T | null>
  setJson(key: string, value: unknown, ttlSeconds?: number): Promise<void>
  delete(key: string): Promise<void>
}

export interface AudioStore {
  buildFinalAudioKey(env: string, variant: string, date: string): string
  buildTempBatchKey(env: string, variant: string, date: string, batchIndex: number, timestamp: number): string
  putAudio(key: string, body: Uint8Array, contentType?: string): Promise<void>
  getAudio(key: string, range?: AudioRangeRequest): Promise<AudioObjectBody | null>
  headAudio(key: string): Promise<AudioObjectDescriptor | null>
  deleteAudio(key: string): Promise<void>
}
