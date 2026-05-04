import { Queue } from 'bullmq'
import { getRuntime } from './runtime.js'

export interface GenerationJob {
  date: string
  variant: string
  replay?: boolean
}

export function getQueues() {
  const { env } = getRuntime()
  const connection = {
    url: env.redisUrl,
  }

  const scriptQueue = new Queue<GenerationJob>('generate-script', {
    connection,
    prefix: env.queuePrefix,
    defaultJobOptions: {
      attempts: env.queueAttempts,
      backoff: {
        type: 'exponential',
        delay: env.queueBackoffMs,
      },
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  })

  const audioQueue = new Queue<GenerationJob>('generate-audio', {
    connection,
    prefix: env.queuePrefix,
    defaultJobOptions: {
      attempts: env.queueAttempts,
      backoff: {
        type: 'exponential',
        delay: env.queueBackoffMs,
      },
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  })

  return {
    scriptQueue,
    audioQueue,
  }
}
