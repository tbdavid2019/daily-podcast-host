const MAX_TTS_SEGMENT_CHARS = 400

export function chunkDialogueText(text: string, maxChars = MAX_TTS_SEGMENT_CHARS) {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return []
  }
  if (normalized.length <= maxChars) {
    return [normalized]
  }

  const sentences = normalized.match(/[^。！？!?；;]+[。！？!?；;]?/gu) || [normalized]
  const segments: string[] = []
  let current = ''

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim()
    if (!trimmedSentence) {
      continue
    }

    if ((current + trimmedSentence).length <= maxChars) {
      current += trimmedSentence
      continue
    }

    if (current) {
      segments.push(current.trim())
      current = ''
    }

    if (trimmedSentence.length <= maxChars) {
      current = trimmedSentence
      continue
    }

    for (let index = 0; index < trimmedSentence.length; index += maxChars) {
      const chunk = trimmedSentence.slice(index, index + maxChars).trim()
      if (chunk) {
        segments.push(chunk)
      }
    }
  }

  if (current) {
    segments.push(current.trim())
  }

  return segments
}

export function pcmToWav(pcmData: Uint8Array, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
  const blockAlign = channels * (bitsPerSample / 8)
  const byteRate = sampleRate * blockAlign
  const dataSize = pcmData.length
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index))
    }
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  writeString(36, 'data')
  view.setUint32(40, dataSize, true)

  new Uint8Array(buffer, 44).set(pcmData)
  return buffer
}

export function combineAudioBuffers(buffers: Uint8Array[], isWav: boolean) {
  if (buffers.length === 0) {
    return new Uint8Array(0)
  }

  if (isWav) {
    const pcmParts: Uint8Array[] = []
    let totalPcmLength = 0

    for (const buffer of buffers) {
      if (buffer.byteLength <= 44) {
        continue
      }
      const pcmPart = buffer.subarray(44)
      pcmParts.push(pcmPart)
      totalPcmLength += pcmPart.byteLength
    }

    const combinedPcm = new Uint8Array(totalPcmLength)
    let offset = 0
    for (const part of pcmParts) {
      combinedPcm.set(part, offset)
      offset += part.byteLength
    }

    return new Uint8Array(pcmToWav(combinedPcm))
  }

  const totalLength = buffers.reduce((total, buffer) => total + buffer.byteLength, 0)
  const combined = new Uint8Array(totalLength)
  let offset = 0
  for (const buffer of buffers) {
    combined.set(buffer, offset)
    offset += buffer.byteLength
  }
  return combined
}
