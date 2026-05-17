import { NextResponse } from 'next/server'

/**
 * Server-side proxy for Google Cloud Vision OCR.
 * Keeps GOOGLE_CLOUD_VISION_API_KEY off the client bundle.
 * SECURITY: Never log image content or extracted field values (PHI).
 */
export async function POST(request: Request) {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY

  if (!apiKey) {
    return NextResponse.json(
      { responses: [{ textAnnotations: [] }] },
      { status: 503 },
    )
  }

  let body: { imageBase64?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.imageBase64 || typeof body.imageBase64 !== 'string') {
    return NextResponse.json({ error: 'imageBase64 is required' }, { status: 400 })
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 14_000) // slightly under client timeout

    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: body.imageBase64 },
              features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
              imageContext: { languageHints: ['en', 'ar'] },
            },
          ],
        }),
        signal: controller.signal,
      },
    )

    clearTimeout(timeoutId)

    if (!response.ok) {
      return NextResponse.json(
        { responses: [{ textAnnotations: [] }] },
        { status: 502 },
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json(
      { responses: [{ textAnnotations: [] }] },
      { status: 502 },
    )
  }
}
