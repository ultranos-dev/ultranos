/**
 * POST /api/consultation/format
 *
 * Server-side proxy for the AI consultation formatter.
 * Accepts FormatterInput fields, calls the OpenAI-compatible API with the system
 * prompt and API key (server-side env vars only — never NEXT_PUBLIC_).
 *
 * Returns FormatterOutput shape: { formattedText, suggestedObservations, confidence }
 *
 * If AI API is unavailable, returns 503 so the client-side formatter can fall back
 * to the offline template.
 */

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { AUTH_COOKIE_NAME } from '@/lib/supabase'

const SYSTEM_PROMPT = `You are a communication assistant helping lab technicians structure consultation requests clearly for remote expert review.

YOUR ROLE IS STRICTLY LIMITED TO:
- Organizing the technician's observations and result data into a clear, structured format
- Suggesting what additional observations the technician might want to include
- Improving the clarity and structure of the written request

YOU MUST NOT:
- Interpret lab results
- Suggest diagnoses or differential diagnoses
- Recommend treatments or medications
- Provide clinical opinions or impressions
- Speculate about what the results might mean clinically

Always end your response with a JSON object in this exact format:
{
  "formattedText": "<the structured consultation request text>",
  "suggestedObservations": ["<suggestion 1>", "<suggestion 2>"],
  "confidence": <number between 0 and 1>
}`

interface RouteRequestBody {
  templateType: string
  templateName: string
  templateLoincCode: string
  fields: Array<{ name: string; value: number | string | null; unit: string; flag: string | null }>
  observationsText: string
}

export async function POST(request: Request): Promise<NextResponse> {
  // Fix 5 — Auth check: middleware excludes /api/* so we check session here
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: { getAll: () => cookieStore.getAll() },
      // Must match the browser client's cookie name, or getUser() won't find the session.
      cookieOptions: { name: AUTH_COOKIE_NAME },
    },
  )
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const aiApiUrl = process.env.AI_API_URL
  const aiApiKey = process.env.AI_API_KEY

  if (!aiApiUrl) {
    return NextResponse.json({ error: 'AI API not configured' }, { status: 503 })
  }

  // Fix 1 — SSRF guard: validate AI_API_URL is a real HTTPS endpoint
  let aiApiUrlParsed: URL
  try {
    aiApiUrlParsed = new URL(aiApiUrl)
  } catch {
    return NextResponse.json({ error: 'AI API not configured' }, { status: 503 })
  }
  if (aiApiUrlParsed.protocol !== 'https:') {
    return NextResponse.json({ error: 'AI API not configured' }, { status: 503 })
  }

  let body: RouteRequestBody
  try {
    body = (await request.json()) as RouteRequestBody
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  // Fix 2 — Input validation: prevent oversized requests and prompt injection surface
  if (
    !body.templateType ||
    !body.templateName ||
    !body.templateLoincCode ||
    !Array.isArray(body.fields) ||
    body.fields.length > 100 ||
    (body.observationsText?.length ?? 0) > 4000 ||
    body.templateName.length > 200 ||
    body.templateType.length > 100
  ) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const userMessage = [
    `Please format the following consultation request:`,
    ``,
    `Test Type: ${body.templateType}`,
    `Template: ${body.templateName} (LOINC: ${body.templateLoincCode})`,
    ``,
    `Results:`,
    ...body.fields.map(
      (f) => `  - ${f.name}: ${f.value ?? 'N/A'} ${f.unit}${f.flag ? ` [${f.flag}]` : ''}`,
    ),
    ``,
    `Technician observations: ${body.observationsText || '(none provided)'}`,
  ].join('\n')

  try {
    const aiRes = await fetch(`${aiApiUrlParsed.origin}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(aiApiKey ? { Authorization: `Bearer ${aiApiKey}` } : {}),
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.3,
        max_tokens: 800,
      }),
    })

    if (!aiRes.ok) {
      return NextResponse.json({ error: `AI API error: ${aiRes.status}` }, { status: 503 })
    }

    // Fix 3 — Response size cap: read as text first to guard against oversized responses
    const rawText = await aiRes.text()
    if (rawText.length > 32_000) {
      return NextResponse.json({ error: 'AI response too large' }, { status: 503 })
    }
    let aiBody: { choices: Array<{ message: { content: string } }> }
    try {
      aiBody = JSON.parse(rawText) as typeof aiBody
    } catch {
      return NextResponse.json({ error: 'AI response parse failed' }, { status: 503 })
    }
    const content = aiBody.choices[0]?.message?.content ?? ''

    // Fix 6 — Use lastIndexOf to find the terminal JSON block — system prompt places it last
    const lastBrace = content.lastIndexOf('}')
    const firstBrace = content.lastIndexOf('{', lastBrace)
    const jsonMatch =
      lastBrace !== -1 && firstBrace !== -1 && firstBrace < lastBrace
        ? [content.slice(firstBrace, lastBrace + 1)]
        : null
    if (!jsonMatch) {
      return NextResponse.json({ error: 'AI response missing JSON' }, { status: 503 })
    }

    let parsed: { formattedText: string; suggestedObservations: string[]; confidence: number }
    try {
      parsed = JSON.parse(jsonMatch[0]) as typeof parsed
    } catch {
      return NextResponse.json({ error: 'AI response JSON parse failed' }, { status: 503 })
    }

    return NextResponse.json({
      formattedText: parsed.formattedText,
      suggestedObservations: parsed.suggestedObservations ?? [],
      confidence: parsed.confidence ?? 0.5,
    })
  } catch (err) {
    console.error('[/api/consultation/format] AI API call failed:', err instanceof Error ? err.message.slice(0, 120) : 'unknown error')
    return NextResponse.json({ error: 'AI API unreachable' }, { status: 503 })
  }
}
