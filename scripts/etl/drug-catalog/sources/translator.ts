const MODEL = 'gemini-2.5-flash'

export async function translate(
  text: string,
  fetchImpl: typeof fetch = fetch,
  apiKey: string | undefined = process.env.GEMINI_API_KEY,
): Promise<{ ar?: string; prs?: string; ps?: string } | null> {
  const trimmed = text?.trim()
  if (!trimmed || !apiKey) return null
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`
  const prompt =
    'Translate the following English drug-information text for patients into Modern Standard Arabic, Dari (Farsi), and Pashto. ' +
    'Preserve medical accuracy; translate the text only, no notes. ' +
    'Return a JSON object with exactly these keys: "ar" (Arabic), "prs" (Dari), "ps" (Pashto). ' +
    `Text:\n${trimmed}`
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    })
    if (!res.ok) return null
    const json = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    const raw = json.candidates?.[0]?.content?.parts?.[0]?.text
    if (!raw) return null
    const parsed = JSON.parse(raw) as { ar?: string; prs?: string; ps?: string }
    const out: { ar?: string; prs?: string; ps?: string } = {}
    if (parsed.ar?.trim()) out.ar = parsed.ar.trim()
    if (parsed.prs?.trim()) out.prs = parsed.prs.trim()
    if (parsed.ps?.trim()) out.ps = parsed.ps.trim()
    return Object.keys(out).length ? out : null
  } catch {
    return null
  }
}
