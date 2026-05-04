import { getAudioObject } from '@/lib/runtime'

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const filePath = path.join('/')
  const rangeHeader = request.headers.get('range')
  const parsedRange = parseRangeHeader(rangeHeader)

  const object = await getAudioObject(filePath, parsedRange)
  if (!object) {
    return new Response('File not found', { status: 404 })
  }

  const isPartial = Boolean(object.range)
  const headers: Record<string, string> = {
    'Content-Type': object.contentType || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Content-Length': String(object.body.byteLength),
    'Cache-Control': 'public, max-age=31536000, immutable',
  }

  if (object.range) {
    headers['Content-Range'] = `bytes ${object.range.start}-${object.range.end}/${object.range.total}`
  }

  const bytes = Uint8Array.from(object.body)
  const body = new Blob([bytes], {
    type: object.contentType || 'application/octet-stream',
  })

  return new Response(body, {
    status: isPartial ? 206 : 200,
    headers,
  })
}

function parseRangeHeader(value: string | null) {
  if (!value?.startsWith('bytes=')) {
    return undefined
  }

  const [startPart, endPart] = value.slice(6).split('-')
  return {
    start: startPart ? Number.parseInt(startPart, 10) : undefined,
    end: endPart ? Number.parseInt(endPart, 10) : undefined,
  }
}
