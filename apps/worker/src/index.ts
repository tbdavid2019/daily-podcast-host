import { createQueueWorkers, generateAudioCommand, generateScriptCommand, replayCommand, runDailyCommand } from './commands.js'
import { getWorkerEnv } from './config.js'

async function main() {
  const env = getWorkerEnv()
  const command = process.argv[2] || 'worker'
  const date = process.argv[3] || new Date().toISOString().slice(0, 10)
  const variant = process.argv[4] || env.defaultVariant

  if (command === 'run-daily') {
    await runDailyCommand({ date, variant })
    return
  }

  if (command === 'generate-script') {
    await generateScriptCommand({ date, variant })
    return
  }

  if (command === 'generate-audio') {
    await generateAudioCommand({ date, variant })
    return
  }

  if (command === 'replay') {
    await replayCommand({ date, variant, replay: true })
    return
  }

  const { scriptWorker, audioWorker } = createQueueWorkers()
  await Promise.all([
    new Promise<void>((resolve, reject) => {
      scriptWorker.on('ready', () => resolve())
      scriptWorker.on('error', reject)
    }),
    new Promise<void>((resolve, reject) => {
      audioWorker.on('ready', () => resolve())
      audioWorker.on('error', reject)
    }),
  ])
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
