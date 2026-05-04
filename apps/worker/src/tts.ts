import { Buffer } from 'node:buffer'
import { synthesize } from '@echristian/edge-tts'
import type { WorkerEnv } from './config.js'

function writeString(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index))
  }
}

function pcmToWav(pcmData: Uint8Array, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8
  const blockAlign = (numChannels * bitsPerSample) / 8
  const dataSize = pcmData.byteLength
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  const pcmView = new Uint8Array(buffer, 44)
  pcmView.set(pcmData)

  return buffer
}

async function geminiTts(text: string, gender: '男' | '女', env: WorkerEnv) {
  if (!env.geminiTtsApiKey) {
    throw new Error('Gemini TTS API key is missing')
  }

  const model = env.geminiTtsModel || 'gemini-2.5-flash-preview-tts'
  const voiceName = gender === '男' ? (env.manVoiceId || 'Puck') : (env.womanVoiceId || 'Leda')
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.geminiTtsApiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      }),
    },
  )

  if (!response.ok) {
    throw new Error(`Gemini TTS failed: ${response.status} ${response.statusText}`)
  }

  const result = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string } }> } }>
  }
  const base64Audio = result.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data
  if (!base64Audio) {
    throw new Error('Gemini TTS response missing audio data')
  }

  const bytes = Uint8Array.from(Buffer.from(base64Audio, 'base64'))
  return new Uint8Array(pcmToWav(bytes))
}

async function edgeTts(text: string, gender: '男' | '女', env: WorkerEnv) {
  const { audio } = await synthesize({
    text,
    language: 'zh-TW',
    voice: gender === '男'
      ? (env.manVoiceId || 'zh-TW-YunJheNeural')
      : (env.womanVoiceId || 'zh-TW-HsiaoChenNeural'),
    rate: env.audioSpeed || '10%',
  })

  return new Uint8Array(await audio.arrayBuffer())
}

async function minimaxTts(text: string, gender: '男' | '女', env: WorkerEnv) {
  const response = await fetch(`${env.ttsApiUrl || 'https://api.minimax.chat/v1/t2a_v2'}?GroupId=${env.ttsApiId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.ttsApiKey}`,
    },
    body: JSON.stringify({
      model: env.ttsModel || 'speech-2.5-turbo-preview',
      text,
      timber_weights: [
        {
          voice_id: gender === '男'
            ? (env.manVoiceId || 'Chinese (Mandarin)_Gentleman')
            : (env.womanVoiceId || 'Chinese (Mandarin)_Gentle_Senior'),
          weight: 100,
        },
      ],
      voice_setting: {
        voice_id: '',
        speed: Number(env.audioSpeed || 1.1),
        pitch: 0,
        vol: 1,
        latex_read: false,
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: 'mp3',
      },
      language_boost: 'Chinese',
    }),
  })

  if (!response.ok) {
    throw new Error(`Minimax TTS failed: ${response.status} ${response.statusText}`)
  }

  const result = await response.json() as { data?: { audio?: string } }
  if (!result.data?.audio) {
    throw new Error('Minimax TTS response missing audio data')
  }
  return Uint8Array.from(Buffer.from(result.data.audio, 'hex'))
}

async function openaiTts(text: string, gender: '男' | '女', env: WorkerEnv) {
  const apiKey = env.openaiTtsApiKey || env.openaiApiKey
  const baseUrl = (env.openaiTtsBaseUrl || env.openaiBaseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')
  const voice = gender === '男' ? (env.manVoiceId || 'onyx') : (env.womanVoiceId || 'nova')

  const response = await fetch(`${baseUrl}/audio/speech`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: env.openaiTtsModel || 'gpt-4o-mini-tts',
      voice,
      input: text,
      speed: Number(env.audioSpeed || 1.3),
      instructions: env.openaiTtsInstructions,
    }),
  })

  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(`OpenAI TTS failed: ${response.status} ${response.statusText} ${message}`)
  }

  return new Uint8Array(await response.arrayBuffer())
}

export async function synthesizeSpeech(text: string, gender: '男' | '女', env: WorkerEnv) {
  try {
    if (env.ttsProvider === 'openai') {
      return await openaiTts(text, gender, env)
    }
    if (env.ttsProvider === 'minimax') {
      return await minimaxTts(text, gender, env)
    }
    if (env.ttsProvider === 'gemini') {
      return await geminiTts(text, gender, env)
    }
    return await edgeTts(text, gender, env)
  }
  catch (error) {
    if (env.ttsProvider !== 'edge' && env.ttsProvider !== 'edge-tts') {
      console.warn(`TTS provider ${env.ttsProvider} failed, falling back to edge-tts`, error)
      return edgeTts(text, gender, env)
    }
    throw error
  }
}
