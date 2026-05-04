export interface WorkerEnv {
  redisUrl: string
  databaseUrl: string
  runEnv: string
  defaultVariant: string
  queuePrefix: string
  queueAttempts: number
  queueBackoffMs: number
  queueConcurrency: number
  timezoneOffset: number
  timezoneName: string
  runDailyCron: string
  openaiBaseUrl: string
  openaiApiKey: string
  openaiModel: string
  openaiThinkingModel?: string
  openaiMaxTokens?: number
  openaiMaxCompletionTokens?: number
  jinaKey?: string
  firecrawlKey?: string
  ttsProvider: string
  ttsApiUrl?: string
  ttsApiId?: string
  ttsApiKey?: string
  ttsModel?: string
  manVoiceId?: string
  womanVoiceId?: string
  audioSpeed?: string
  geminiTtsApiKey?: string
  geminiTtsModel?: string
  openaiTtsApiKey?: string
  openaiTtsBaseUrl?: string
  openaiTtsModel?: string
  openaiTtsInstructions?: string
  maxStoryBudget?: number
  s3Endpoint: string
  s3Region: string
  s3AccessKey: string
  s3SecretKey: string
  s3Bucket: string
  s3ForcePathStyle: boolean
}

export function getWorkerEnv(): WorkerEnv {
  return {
    redisUrl: required('REDIS_URL'),
    databaseUrl: required('DATABASE_URL'),
    runEnv: process.env.WORKER_ENV || 'production',
    defaultVariant: process.env.DEFAULT_PODCAST_VARIANT || 'hacker-news',
    queuePrefix: process.env.QUEUE_PREFIX || 'daily-podcast-host',
    queueAttempts: Number.parseInt(process.env.QUEUE_JOB_ATTEMPTS || '5', 10),
    queueBackoffMs: Number.parseInt(process.env.QUEUE_JOB_BACKOFF_MS || '10000', 10),
    queueConcurrency: Number.parseInt(process.env.QUEUE_CONCURRENCY || '1', 10),
    timezoneOffset: Number.parseInt(process.env.TIMEZONE_OFFSET || '8', 10),
    timezoneName: process.env.TIMEZONE_NAME || 'Asia/Taipei',
    runDailyCron: process.env.RUN_DAILY_CRON || '5 7 * * *',
    openaiBaseUrl: required('OPENAI_BASE_URL'),
    openaiApiKey: required('OPENAI_API_KEY'),
    openaiModel: required('OPENAI_MODEL'),
    openaiThinkingModel: process.env.OPENAI_THINKING_MODEL || undefined,
    openaiMaxTokens: parseOptionalInt(process.env.OPENAI_MAX_TOKENS),
    openaiMaxCompletionTokens: parseOptionalInt(process.env.OPENAI_MAX_COMPLETION_TOKENS),
    jinaKey: process.env.JINA_KEY || undefined,
    firecrawlKey: process.env.FIRECRAWL_KEY || undefined,
    ttsProvider: process.env.TTS_PROVIDER || 'edge-tts',
    ttsApiUrl: process.env.TTS_API_URL || undefined,
    ttsApiId: process.env.TTS_API_ID || undefined,
    ttsApiKey: process.env.TTS_API_KEY || undefined,
    ttsModel: process.env.TTS_MODEL || undefined,
    manVoiceId: process.env.MAN_VOICE_ID || undefined,
    womanVoiceId: process.env.WOMAN_VOICE_ID || undefined,
    audioSpeed: process.env.AUDIO_SPEED || undefined,
    geminiTtsApiKey: process.env.GEMINI_TTS_API_KEY || undefined,
    geminiTtsModel: process.env.GEMINI_TTS_MODEL || undefined,
    openaiTtsApiKey: process.env.OPENAI_TTS_API_KEY || undefined,
    openaiTtsBaseUrl: process.env.OPENAI_TTS_BASE_URL || undefined,
    openaiTtsModel: process.env.OPENAI_TTS_MODEL || undefined,
    openaiTtsInstructions: process.env.OPENAI_TTS_INSTRUCTIONS || undefined,
    maxStoryBudget: parseOptionalInt(process.env.MAX_STORY_BUDGET),
    s3Endpoint: required('S3_ENDPOINT'),
    s3Region: process.env.S3_REGION || 'us-east-1',
    s3AccessKey: required('S3_ACCESS_KEY'),
    s3SecretKey: required('S3_SECRET_KEY'),
    s3Bucket: required('S3_BUCKET'),
    s3ForcePathStyle: (process.env.S3_FORCE_PATH_STYLE || 'true') !== 'false',
  }
}

function parseOptionalInt(value: string | undefined) {
  if (!value) {
    return undefined
  }
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

function required(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}
