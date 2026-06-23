const MODEL = 'gemini-2.5-flash'
const RETRYABLE = new Set([429, 500, 503])
const BASE_DELAY_MS = 2000
const MAX_DELAY_MS = 60000

export interface TranslateOpts {
  /** Max retry attempts on transient (429/500/503) failures. Default 5. */
  maxRetries?: number
  /** Injectable delay (tests pass a no-op). Default real setTimeout. */
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Pull Gemini's RetryInfo hint (`"retryDelay": "37s"`) from an error body, in ms. */
function retryDelayFromBody(body: string): number | null {
  const m = body.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/)
  if (!m) return null
  return Math.min(Math.ceil(Number(m[1]) * 1000), MAX_DELAY_MS)
}

export async function translate(
  text: string,
  fetchImpl: typeof fetch = fetch,
  apiKey: string | undefined = process.env.GEMINI_API_KEY,
  opts: TranslateOpts = {},
): Promise<{ ar?: string; prs?: string; ps?: string } | null> {
  const trimmed = text?.trim()
  if (!trimmed || !apiKey) return null
  const maxRetries = opts.maxRetries ?? 5
  const sleep = opts.sleep ?? defaultSleep
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`
  const prompt =
    'Translate the following English drug-information text for patients into Modern Standard Arabic, Dari (Farsi), and Pashto. ' +
    'Preserve medical accuracy; translate the text only, no notes. ' +
    'Return a JSON object with exactly these keys: "ar" (Arabic), "prs" (Dari), "ps" (Pashto). ' +
    `Text:\n${trimmed}`
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json' },
  })

  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      })
      if (res.ok) {
        const json = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
        const raw = json.candidates?.[0]?.content?.parts?.[0]?.text
        if (!raw) return null
        const parsed = JSON.parse(raw) as { ar?: string; prs?: string; ps?: string }
        const out: { ar?: string; prs?: string; ps?: string } = {}
        if (parsed.ar?.trim()) out.ar = parsed.ar.trim()
        if (parsed.prs?.trim()) out.prs = parsed.prs.trim()
        if (parsed.ps?.trim()) out.ps = parsed.ps.trim()
        return Object.keys(out).length ? out : null
      }
      // Non-OK. Retry transient statuses; give up on hard failures and daily caps.
      if (!RETRYABLE.has(res.status) || attempt >= maxRetries) return null
      const errBody = await res.text().catch(() => '')
      // A per-day quota 429 will not clear within this run — stop immediately.
      if (/PerDay/i.test(errBody)) return null
      const delay = retryDelayFromBody(errBody) ?? Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS)
      await sleep(delay)
    } catch {
      if (attempt >= maxRetries) return null
      await sleep(Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS))
    }
  }
}
