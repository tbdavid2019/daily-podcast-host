import { createOpenAI } from '@ai-sdk/openai'
import { generateObject, generateText } from 'ai'
import { z } from 'zod'
import { chunkDialogueText, combineAudioBuffers, getDisplayDate, getRecentDates, getStoryLimitsForDate, introPrompt, podcastScriptPrompt, summarizeBlogPrompt, summarizeStoryPrompt } from '../../../packages/core/src/index.js'
import type { GeneratedScriptData, PodcastDialogueLine, PodcastScriptResponse, Story } from '../../../packages/core/src/types.js'
import { collectExcludedRedditIds } from '../../../packages/core/src/story-selection.js'
import { getQueues } from './queues.js'
import { getRuntime } from './runtime.js'
import { getAllStories, getStoryContent } from './sources.js'
import { synthesizeSpeech } from './tts.js'

const TTS_RETRY_LIMIT = 3
const TTS_RETRY_BASE_DELAY_MS = 500
const TTS_RATE_LIMIT_DELAY_MS = 400
const BATCH_SIZE = 5

export interface PipelineArgs {
  date: string
  variant: string
  replay?: boolean
}

export async function runScriptPipeline(args: PipelineArgs) {
  const { env, episodes, workflowState, runs } = getRuntime()
  const { audioQueue } = getQueues()
  const displayDate = args.date || getDisplayDate(new Date(), env.timezoneOffset)
  const fetchDate = args.date || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const scriptKey = workflowState.getScriptCacheKey(env.runEnv, args.variant, displayDate)
  const existingEpisode = await episodes.getEpisode({
    env: env.runEnv,
    variant: args.variant,
    date: displayDate,
  })

  if (existingEpisode && !args.replay) {
    return existingEpisodeToScript(existingEpisode)
  }

  const openai = createOpenAI({
    name: 'openai',
    baseURL: env.openaiBaseUrl,
    headers: {
      Authorization: `Bearer ${env.openaiApiKey}`,
    },
  })

  const modelName = env.openaiModel.toLowerCase()
  const isGeminiModel = modelName.includes('gemini')
  const maxTokens = env.openaiMaxTokens || (isGeminiModel ? 8192 : 4096)
  const completionTokenLimit = env.openaiMaxCompletionTokens || (isGeminiModel ? 32768 : 16384)
  const storyLimits = getStoryLimitsForDate(displayDate, env.maxStoryBudget)
  const recentDates = getRecentDates(displayDate, 7)
  const recentScripts = await Promise.all(
    recentDates.map(async (date) => {
      const cached = await workflowState.getJson<GeneratedScriptData>(workflowState.getScriptCacheKey(env.runEnv, args.variant, date))
      if (cached) {
        return cached
      }
      const record = await episodes.getEpisode({ env: env.runEnv, variant: args.variant, date })
      return record ? existingEpisodeToScript(record) : null
    }),
  )
  const excludeRedditIds = collectExcludedRedditIds(recentScripts)

  const stories = await getAllStories(fetchDate, { jinaKey: env.jinaKey, firecrawlKey: env.firecrawlKey }, {
    limits: storyLimits,
    excludeRedditIds,
  })

  if (!stories.length) {
    throw new Error('No stories found from configured sources')
  }

  const storyGroups = stories.reduce<Record<string, Story[]>>((groups, story) => {
    const source = story.source || 'unknown'
    groups[source] ||= []
    groups[source].push(story)
    return groups
  }, {})

  const allStoryContents: Array<{ id: string; title: string; content: string; source?: string }> = []
  const contentCacheKeyBase = workflowState.getContentCacheKey(env.runEnv, displayDate)

  for (const [source, sourceStories] of Object.entries(storyGroups)) {
    const cacheKey = `${contentCacheKeyBase}:story-contents:${source}`
    const cached = await workflowState.getJson<Array<{ id: string; title: string; content: string; source?: string }>>(cacheKey)
    if (cached?.length === sourceStories.length && !args.replay) {
      allStoryContents.push(...cached)
      continue
    }

    const contents: Array<{ id: string; title: string; content: string; source?: string }> = []
    for (const story of sourceStories) {
      const storyContent = await getStoryContent(story, maxTokens, { jinaKey: env.jinaKey, firecrawlKey: env.firecrawlKey })
      if (!storyContent || storyContent.trim().length < 50) {
        continue
      }
      contents.push({
        id: story.id || '',
        title: story.title || '',
        content: storyContent,
        source: story.source,
      })
    }

    if (contents.length > 0) {
      await workflowState.setJson(cacheKey, contents, 60 * 60 * 24)
      allStoryContents.push(...contents)
    }
  }

  if (!allStoryContents.length) {
    throw new Error('No valid story content available after fetch/filter stage')
  }

  const expectedCount = allStoryContents.length
  const combinedContent = allStoryContents.map((story, index) =>
    `<story id="${story.id}" title="${story.title}" number="${index + 1}">\n${story.content}\n</story>`,
  ).join('\n\n---\n\n')

  const storySummariesText = await generateText({
    model: openai(env.openaiModel),
    system: `${summarizeStoryPrompt}\n\n請為每篇文章生成摘要。**重要：你必須為所有 ${expectedCount} 篇文章都生成摘要**。請用 <story-summary id="文章ID"> 標籤包裹每個摘要，確保數量正確。`,
    prompt: combinedContent,
    maxTokens: Math.min(maxTokens * 2, completionTokenLimit),
  })

  const storySummaries = parseStorySummaries(storySummariesText.text)

  const storyList = stories.map((story, index) => `${index + 1}. [${story.source}] ${story.title}`).join('\n')
  const suggestedTurns = Math.ceil(stories.length / 2.5) + 5
  const minTurns = Math.max(8, Math.ceil(stories.length / 3))
  const maxTurns = Math.min(35, Math.ceil(stories.length * 2))
  const fullContentString = allStoryContents.map((story, index) =>
    `<story id="${story.id}" title="${story.title}" source="${story.source}" number="${index + 1}">\n${story.content}\n</story>`,
  ).join('\n\n---\n\n')

  const podcastScript = await generateObject({
    model: openai(env.openaiThinkingModel || env.openaiModel),
    system: podcastScriptPrompt,
    prompt: `日期: ${displayDate}
【必須討論的故事清單】（共 ${stories.length} 個故事，每一個都必須討論）
${storyList}

【動態對話輪數建議】
- 建議對話輪數：${Math.min(suggestedTurns, maxTurns)} 輪（範圍：${minTurns}-${maxTurns} 輪）
- 每輪專注討論 2-3 個故事，但每段話請講久一點（300-600 字）以確保深度
- 根據實際內容靈活調整，但確保所有故事都被涵蓋

<story-metadata>${JSON.stringify(stories)}</story-metadata>

<raw-story-content>
${fullContentString}
</raw-story-content>`,
    maxTokens: Math.min(maxTokens * 2, completionTokenLimit),
    maxRetries: 3,
    schema: z.object({
      title: z.string().optional(),
      dialogue: z.array(z.object({
        speaker: z.enum(['男', '女']),
        text: z.string().min(1),
      })).min(1),
    }),
  })

  const sanitizedDialogue = podcastScript.object.dialogue.map((line, index) => {
    const speaker = typeof line.speaker === 'string' ? line.speaker.trim() : ''
    const text = typeof line.text === 'string' ? line.text.trim() : ''
    if (!speaker || !text) {
      throw new Error(`Invalid dialogue line at index ${index}`)
    }
    return { speaker: speaker as PodcastDialogueLine['speaker'], text }
  })

  const scriptResponse: PodcastScriptResponse = {
    title: podcastScript.object.title,
    dialogue: sanitizedDialogue,
  }

  if (!scriptResponse.title || scriptResponse.title.length < 5) {
    const beautifiedTitle = await generateText({
      model: openai(env.openaiModel),
      system: '你是播客總編輯。請輸出一個驚悚、吸睛、符合 SEO 的中文科技播客標題。',
      prompt: `日期: ${displayDate}\n故事摘要：\n${storySummaries.join('\n')}`,
      maxRetries: 3,
    })
    scriptResponse.title = beautifiedTitle.text.trim().replace(/^"|"$/g, '')
  }

  const blogContent = await generateText({
    model: openai(env.openaiThinkingModel || env.openaiModel),
    system: summarizeBlogPrompt,
    prompt: `<stories>${JSON.stringify(stories)}</stories>\n\n---\n\n${storySummaries.join('\n\n---\n\n')}`,
    maxTokens: Math.min(maxTokens, completionTokenLimit),
    maxRetries: 3,
  })

  const introContent = await generateText({
    model: openai(env.openaiModel),
    system: introPrompt,
    prompt: scriptResponse.dialogue.map((line) => `${line.speaker}：${line.text}`).join('\n'),
    maxRetries: 3,
  })

  const scriptData: GeneratedScriptData = {
    title: scriptResponse.title,
    dialogue: scriptResponse.dialogue,
    blogContent: blogContent.text,
    introContent: introContent.text,
    stories,
    storySummaries,
    displayDate,
    generatedAt: Date.now(),
  }

  await workflowState.setJson(scriptKey, scriptData, 60 * 60 * 24 * 7)
  await episodes.saveEpisode({
    env: env.runEnv,
    variant: args.variant,
    date: displayDate,
    title: scriptData.title || displayDate,
    introContent: scriptData.introContent,
    blogContent: scriptData.blogContent,
    dialogue: scriptData.dialogue,
    stories: scriptData.stories,
    storySummaries: scriptData.storySummaries,
    generatedAt: scriptData.generatedAt || Date.now(),
  })

  await runs.saveRun({
    env: env.runEnv,
    variant: args.variant,
    date: displayDate,
    phase: 'script',
    status: 'completed',
    attempts: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })

  await audioQueue.add('generate-audio', {
    date: displayDate,
    variant: args.variant,
    replay: args.replay,
  }, {
    jobId: `audio:${env.runEnv}:${args.variant}:${displayDate}`,
  })

  return scriptData
}

export async function runAudioPipeline(args: PipelineArgs) {
  const { env, episodes, workflowState, audio, runs } = getRuntime()
  const scriptKey = workflowState.getScriptCacheKey(env.runEnv, args.variant, args.date)
  const cachedScript = await workflowState.getJson<GeneratedScriptData>(scriptKey)
  const episode = cachedScript || await episodes.getEpisode({
    env: env.runEnv,
    variant: args.variant,
    date: args.date,
  }).then((record) => record ? existingEpisodeToScript(record) : null)

  if (!episode) {
    throw new Error(`Episode/script not found for ${args.variant} ${args.date}`)
  }

  if (!episode.dialogue?.length) {
    throw new Error(`Dialogue is empty for ${args.variant} ${args.date}`)
  }

  const finalKey = audio.buildFinalAudioKey(env.runEnv, args.variant, args.date)
  const existingAudio = await audio.headAudio(finalKey)
  if (existingAudio && !args.replay) {
    return { key: finalKey, size: existingAudio.size }
  }

  const isGeminiTts = env.ttsProvider === 'gemini'
  const allSegments: Array<{ text: string; speaker: '男' | '女' }> = []
  for (const line of episode.dialogue) {
    const text = line.text.trim()
    if (!text) {
      continue
    }
    for (const chunk of chunkDialogueText(text)) {
      allSegments.push({ text: chunk, speaker: line.speaker })
    }
  }

  const batchKeys: string[] = []
  for (let index = 0; index < allSegments.length; index += BATCH_SIZE) {
    const batchIndex = Math.floor(index / BATCH_SIZE)
    const batchSegments = allSegments.slice(index, index + BATCH_SIZE)
    const buffers: Uint8Array[] = []

    for (const [segmentIndex, segment] of batchSegments.entries()) {
      let attempt = 0
      while (true) {
        try {
          const audioBytes = await synthesizeSpeech(segment.text, segment.speaker, env)
          if (!audioBytes.byteLength) {
            throw new Error('Synthesized audio is empty')
          }
          buffers.push(audioBytes)
          break
        }
        catch (error) {
          attempt += 1
          if (attempt >= TTS_RETRY_LIMIT) {
            throw error
          }
          await sleep(TTS_RETRY_BASE_DELAY_MS * attempt)
        }
      }

      if (segmentIndex < batchSegments.length - 1) {
        await sleep(TTS_RATE_LIMIT_DELAY_MS)
      }
    }

    const combined = combineAudioBuffers(buffers, isGeminiTts)
    const tempKey = audio.buildTempBatchKey(env.runEnv, args.variant, args.date, batchIndex, Date.now())
    await audio.putAudio(tempKey, combined, isGeminiTts ? 'audio/wav' : 'audio/mpeg')
    batchKeys.push(tempKey)
  }

  const finalBuffers: Uint8Array[] = []
  for (const key of batchKeys) {
    const object = await audio.getAudio(key)
    if (!object) {
      throw new Error(`Missing temp audio batch ${key}`)
    }
    finalBuffers.push(object.body)
  }

  const finalAudio = combineAudioBuffers(finalBuffers, isGeminiTts)
  await audio.putAudio(finalKey, finalAudio, isGeminiTts ? 'audio/wav' : 'audio/mpeg')

  await Promise.all(batchKeys.map((key) => audio.deleteAudio(key)))

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

  return { key: finalKey, size: finalAudio.byteLength }
}

function parseStorySummaries(text: string) {
  const summaries: string[] = []
  const parts = text.split('<story-summary')
  if (parts.length > 1) {
    for (let index = 1; index < parts.length; index += 1) {
      const endIndex = parts[index].indexOf('</story-summary>')
      if (endIndex !== -1) {
        const content = parts[index].substring(parts[index].indexOf('>') + 1, endIndex).trim()
        summaries.push(`<story>${content}</story>`)
      }
    }
  }

  if (summaries.length === 0) {
    const fallback = text.split('---').map((part) => part.trim()).filter(Boolean)
    return fallback.length ? fallback.map((part) => `<story>${part}</story>`) : [`<story>${text}</story>`]
  }

  return summaries
}

function existingEpisodeToScript(record: {
  title: string
  dialogue: PodcastDialogueLine[]
  blogContent: string
  introContent: string
  stories: Story[]
  storySummaries: string[]
  date: string
  generatedAt: number
}): GeneratedScriptData {
  return {
    title: record.title,
    dialogue: record.dialogue,
    blogContent: record.blogContent,
    introContent: record.introContent,
    stories: record.stories,
    storySummaries: record.storySummaries,
    displayDate: record.date,
    generatedAt: record.generatedAt,
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
