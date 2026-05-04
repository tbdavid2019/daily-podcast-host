import type { AudioObjectBody, AudioObjectDescriptor, AudioRangeRequest, AudioStore } from './types.js'

export interface S3HeadResult {
  contentType?: string
  contentLength: number
  etag?: string
}

export interface S3GetResult extends S3HeadResult {
  body: Uint8Array
  contentRange?: string
}

export interface S3Client {
  putObject(input: { bucket: string; key: string; body: Uint8Array; contentType: string }): Promise<void>
  getObject(input: { bucket: string; key: string; range?: string }): Promise<S3GetResult | null>
  headObject(input: { bucket: string; key: string }): Promise<S3HeadResult | null>
  deleteObject(input: { bucket: string; key: string }): Promise<void>
}

export class S3AudioStore implements AudioStore {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  buildFinalAudioKey(env: string, variant: string, date: string) {
    return `${date.replaceAll('-', '/')}/${env}/${variant}-${date}.mp3`
  }

  buildTempBatchKey(env: string, variant: string, date: string, batchIndex: number, timestamp: number) {
    return `${date.replaceAll('-', '/')}/${env}/temp/${variant}-batch-${batchIndex}-${timestamp}.mp3`
  }

  async putAudio(key: string, body: Uint8Array, contentType = 'audio/mpeg') {
    await this.client.putObject({
      bucket: this.bucket,
      key,
      body,
      contentType,
    })
  }

  async getAudio(key: string, range?: AudioRangeRequest) {
    const object = await this.client.getObject({
      bucket: this.bucket,
      key,
      range: range ? formatRange(range) : undefined,
    })

    if (!object) {
      return null
    }

    return {
      key,
      body: object.body,
      size: object.contentLength,
      contentType: object.contentType || 'application/octet-stream',
      etag: object.etag,
      range: parseContentRange(object.contentRange),
    } satisfies AudioObjectBody
  }

  async headAudio(key: string) {
    const object = await this.client.headObject({
      bucket: this.bucket,
      key,
    })

    if (!object) {
      return null
    }

    return {
      key,
      size: object.contentLength,
      contentType: object.contentType || 'application/octet-stream',
      etag: object.etag,
    } satisfies AudioObjectDescriptor
  }

  async deleteAudio(key: string) {
    await this.client.deleteObject({
      bucket: this.bucket,
      key,
    })
  }
}

function formatRange(range: AudioRangeRequest) {
  const start = typeof range.start === 'number' ? range.start : ''
  const end = typeof range.end === 'number' ? range.end : ''
  return `bytes=${start}-${end}`
}

function parseContentRange(contentRange?: string) {
  if (!contentRange) {
    return undefined
  }

  const match = /bytes (\d+)-(\d+)\/(\d+)/.exec(contentRange)
  if (!match) {
    return undefined
  }

  return {
    start: Number.parseInt(match[1], 10),
    end: Number.parseInt(match[2], 10),
    total: Number.parseInt(match[3], 10),
  }
}
