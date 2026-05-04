import { Worker } from 'bullmq'
import type { Job } from 'bullmq'
import { getRuntime } from './runtime.js'
import { runAudioPipeline, runScriptPipeline } from './pipeline.js'
import { getQueues } from './queues.js'

interface CommandArgs {
  date: string
  variant: string
  replay?: boolean
}

export async function runDailyCommand(args: CommandArgs) {
  const { env, runs, workflowState } = getRuntime()
  const { scriptQueue } = getQueues()
  const lockKey = workflowState.getWorkflowLockKey(env.runEnv, args.variant, args.date, 'script')
  const acquired = await workflowState.acquireRunLock(lockKey, `run-daily:${args.date}:${args.variant}`, 300)

  if (!acquired) {
    throw new Error(`Duplicate run rejected for ${args.variant} ${args.date}`)
  }

  try {
    await runs.saveRun({
      env: env.runEnv,
      variant: args.variant,
      date: args.date,
      phase: 'script',
      status: 'queued',
      attempts: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    await scriptQueue.add('generate-script', {
      date: args.date,
      variant: args.variant,
      replay: args.replay,
    }, {
      jobId: `script:${env.runEnv}:${args.variant}:${args.date}`,
    })
  }
  finally {
    await workflowState.releaseRunLock(lockKey)
  }
}

export async function generateScriptCommand(args: CommandArgs) {
  const { env, runs } = getRuntime()

  await runs.saveRun({
    env: env.runEnv,
    variant: args.variant,
    date: args.date,
    phase: 'script',
    status: 'running',
    attempts: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })

  await runScriptPipeline(args)
}

export async function generateAudioCommand(args: CommandArgs) {
  const { env, runs } = getRuntime()
  await runs.saveRun({
    env: env.runEnv,
    variant: args.variant,
    date: args.date,
    phase: 'audio',
    status: 'running',
    attempts: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })

  await runAudioPipeline(args)

  await runs.saveRun({
    env: env.runEnv,
    variant: args.variant,
    date: args.date,
    phase: 'audio',
    status: 'completed',
    attempts: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })
}

export async function replayCommand(args: CommandArgs) {
  return runDailyCommand({
    ...args,
    replay: true,
  })
}

export function createQueueWorkers() {
  const { env, runs } = getRuntime()
  const connection = {
    url: env.redisUrl,
  }

  const scriptWorker = new Worker(
    'generate-script',
    async (job: Job<{ date: string; variant: string; replay?: boolean }>) => {
      try {
        await generateScriptCommand(job.data)
      }
      catch (error) {
        await runs.saveRun({
          env: env.runEnv,
          variant: job.data.variant,
          date: job.data.date,
          phase: 'script',
          status: 'failed',
          attempts: job.attemptsMade + 1,
          errorMessage: error instanceof Error ? error.message : String(error),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
        throw error
      }
    },
    {
      connection,
      prefix: env.queuePrefix,
      concurrency: env.queueConcurrency,
    },
  )

  const audioWorker = new Worker(
    'generate-audio',
    async (job: Job<{ date: string; variant: string; replay?: boolean }>) => {
      try {
        await generateAudioCommand(job.data)
      }
      catch (error) {
        await runs.saveRun({
          env: env.runEnv,
          variant: job.data.variant,
          date: job.data.date,
          phase: 'audio',
          status: 'failed',
          attempts: job.attemptsMade + 1,
          errorMessage: error instanceof Error ? error.message : String(error),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
        throw error
      }
    },
    {
      connection,
      prefix: env.queuePrefix,
      concurrency: env.queueConcurrency,
    },
  )

  return {
    scriptWorker,
    audioWorker,
  }
}
