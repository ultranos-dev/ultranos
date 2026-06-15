/**
 * Audio result script registry — Story 45.4: Plain-Language Audio Result Summaries
 *
 * HARD RULE — NEVER AI-GENERATED AUDIO:
 * Every script MUST be written by a physician, recorded by a human, reviewed and
 * approved by a physician. `approvedBy` and `approvedAt` track this. Entries with
 * empty `approvedBy`/`approvedAt` are pending physician review and will show the
 * plain-text fallback only — they will NOT play audio.
 *
 * Story 45.4 AC: #1, #2, #4, #5
 */

export type Interpretation = 'normal' | 'low' | 'high' | 'critical-low' | 'critical-high'

export interface AudioResultScript {
  /** Unique identifier, e.g. "cbc-hemoglobin-low" */
  id: string
  /** LOINC category code from loinc-categories.ts */
  testCategory: string
  /** Specific analyte / result field (e.g. "hemoglobin") */
  resultField: string
  interpretation: Interpretation
  /** Semantic version, e.g. "1.0.0" */
  version: string
  /** Physician who approved the script. Empty string = pending review. */
  approvedBy: string
  /** ISO 8601 approval timestamp. Empty string = pending review. */
  approvedAt: string
  /** locale → relative URL to the MP3 file in public/audio/results/ */
  audioFiles: Record<string, string>
  /** locale → plain-language text fallback when audio is unavailable */
  plainTextScripts: Record<string, string>
}

/**
 * Overall bundle version — bump when any script is updated.
 * The Service Worker uses this to invalidate the audio cache.
 */
export const SCRIPT_MANIFEST_VERSION = '1.0.0'

// ---------------------------------------------------------------------------
// Approval helpers
// ---------------------------------------------------------------------------

/** Substring patterns that indicate an automated/AI approver — prohibited. */
const AUTOMATED_APPROVER_PATTERNS = [
  'ai',
  'gpt',
  'claude',
  'openai',
  'anthropic',
  'automated',
  'system',
  'auto',
  'bot',
  'llm',
  'ml',
  'machine',
]

/** Returns true if the approver string looks like an AI / automated value. */
export function isAutomatedApprover(approvedBy: string): boolean {
  const lower = approvedBy.toLowerCase()
  return AUTOMATED_APPROVER_PATTERNS.some(p => lower.includes(p))
}

/**
 * Returns true if the script has been reviewed and approved by a human physician.
 * Scripts with empty or automated approvers are considered NOT approved.
 */
export function isScriptApproved(script: AudioResultScript): boolean {
  if (!script.approvedBy || !script.approvedAt) return false
  return !isAutomatedApprover(script.approvedBy)
}

/**
 * Validates a script registry. Throws if any entry lacks `approvedBy`.
 * Intended for use in CI pipelines to prevent un-reviewed scripts from shipping.
 *
 * Note: MVP placeholder entries (approvedBy: '') will intentionally fail
 * this validation — that is by design so CI reminds the team to get physician sign-off.
 */
export function validateScriptRegistry(scripts: AudioResultScript[]): void {
  const unapproved = scripts.filter(s => !s.approvedBy || !s.approvedAt)
  if (unapproved.length > 0) {
    const ids = unapproved.map(s => s.id).join(', ')
    throw new Error(
      `Script registry contains entries without physician approval: ${ids}`,
    )
  }
  const aiApproved = scripts.filter(
    s => s.approvedBy && isAutomatedApprover(s.approvedBy),
  )
  if (aiApproved.length > 0) {
    const ids = aiApproved.map(s => s.id).join(', ')
    throw new Error(
      `Script registry contains entries with AI/automated approvers (prohibited): ${ids}`,
    )
  }
}

// ---------------------------------------------------------------------------
// Registry lookup
// ---------------------------------------------------------------------------

/**
 * Resolves the correct audio script for a test category, result field, and interpretation.
 * Returns null if no matching script is found.
 */
export function resolveAudioScript(
  testCategory: string,
  resultField: string,
  interpretation: Interpretation,
): AudioResultScript | null {
  return (
    AUDIO_SCRIPT_REGISTRY.find(
      s =>
        s.testCategory === testCategory &&
        s.resultField === resultField &&
        s.interpretation === interpretation,
    ) ?? null
  )
}

// ---------------------------------------------------------------------------
// MVP Script Registry
// 8 LOINC categories × 5 interpretation levels = 40 entries
//
// approvedBy / approvedAt are empty: MVP placeholders pending physician review.
// The AudioResultPlayer will show plain-text fallback for these entries.
// Audio files will be added by physicians per the recording workflow in Dev Notes.
// ---------------------------------------------------------------------------

const MVP_APPROVAL = {
  approvedBy: '',
  approvedAt: '',
  version: '1.0.0',
}

function audioFiles(
  category: string,
  analyte: string,
  interpretation: Interpretation,
): Record<string, string> {
  return {
    en: `/audio/results/${category}/${analyte}-${interpretation}-en.mp3`,
    ar: `/audio/results/${category}/${analyte}-${interpretation}-ar.mp3`,
    prs: `/audio/results/${category}/${analyte}-${interpretation}-prs.mp3`,
    ps: `/audio/results/${category}/${analyte}-${interpretation}-ps.mp3`,
  }
}

export const AUDIO_SCRIPT_REGISTRY: readonly AudioResultScript[] = [
  // ── CBC (Blood Work — 58410-2) ──────────────────────────────────────────────
  {
    id: 'cbc-normal',
    testCategory: '58410-2',
    resultField: 'cbc',
    interpretation: 'normal',
    ...MVP_APPROVAL,
    audioFiles: audioFiles('cbc', 'cbc', 'normal'),
    plainTextScripts: {
      en: 'Your blood test results are all in the healthy range. No action is needed. Your doctor will still discuss these with you at your next visit.',
      ar: 'نتائج فحص الدم الخاصة بك كلها في النطاق الصحي. لا حاجة لأي إجراء. سيناقشها معك طبيبك في زيارتك القادمة.',
      prs: 'نتایج آزمایش خون شما همه در محدوده سالم هستند. هیچ اقدامی لازم نیست. پزشک شما در ملاقات بعدی با شما درباره این موارد صحبت خواهد کرد.',
      ps: 'ستاسو د وینې د معاینې پایلې ټولې د روغتیا د حد پروت دي. کوم عمل ته اړتیا نشته. ستاسو ډاکتر به دا ستاسو سره د راتلونکي مراجعت پرمهال بحث وکړي.',
    },
  },
  {
    id: 'cbc-low',
    testCategory: '58410-2',
    resultField: 'cbc',
    interpretation: 'low',
    ...MVP_APPROVAL,
    audioFiles: audioFiles('cbc', 'cbc', 'low'),
    plainTextScripts: {
      en: 'Your blood strength is a little low. This is not dangerous right now, but your doctor will discuss it with you and may suggest treatment.',
      ar: 'قوة دمك منخفضة قليلاً. هذا ليس خطيراً في الوقت الحالي، لكن طبيبك سيناقش ذلك معك وقد يقترح علاجاً.',
      prs: 'قدرت خون شما کمی پایین است. این در حال حاضر خطرناک نیست، اما پزشک شما با شما درباره آن صحبت خواهد کرد و ممکن است درمان را پیشنهاد دهد.',
      ps: 'ستاسو د وینې ځواک لږ ټیټ دی. دا اوس خطرناک ندی، مګر ستاسو ډاکتر به دا ستاسو سره بحث وکړي او کیدای شي درمان وړاندیز وکړي.',
    },
  },
  {
    id: 'cbc-high',
    testCategory: '58410-2',
    resultField: 'cbc',
    interpretation: 'high',
    ...MVP_APPROVAL,
    audioFiles: audioFiles('cbc', 'cbc', 'high'),
    plainTextScripts: {
      en: 'One of your blood levels is a little high. This is not an emergency, but your doctor will want to talk with you about it.',
      ar: 'أحد مستويات دمك مرتفع قليلاً. هذه ليست حالة طوارئ، لكن طبيبك سيريد التحدث معك عن ذلك.',
      prs: 'یکی از سطوح خون شما کمی بالا است. این یک اورژانس نیست، اما پزشک شما می‌خواهد با شما درباره آن صحبت کند.',
      ps: 'ستاسو د وینې یو کچه لږ لوړه ده. دا بیړني حالت ندی، مګر ستاسو ډاکتر غواړي چې ستاسو سره پدې اړه خبرې وکړي.',
    },
  },
  {
    id: 'cbc-critical-low',
    testCategory: '58410-2',
    resultField: 'cbc',
    interpretation: 'critical-low',
    ...MVP_APPROVAL,
    audioFiles: audioFiles('cbc', 'cbc', 'critical-low'),
    plainTextScripts: {
      en: 'Your blood result needs urgent attention. Please do not leave the clinic without speaking to a doctor or nurse right now.',
      ar: 'نتيجة الدم الخاصة بك تحتاج إلى عناية عاجلة. يرجى عدم مغادرة العيادة دون التحدث مع الطبيب أو الممرضة الآن.',
      prs: 'نتیجه خون شما نیاز به توجه فوری دارد. لطفاً بدون صحبت با پزشک یا پرستار همین الان از کلینیک نروید.',
      ps: 'ستاسو د وینې پایله فوري پاملرنې ته اړتیا لري. مهرباني وکړئ له کلینیک ووځئ پرته له دې چې اوس سمدستي له ډاکتر یا نرس سره خبرې وکړئ.',
    },
  },
  {
    id: 'cbc-critical-high',
    testCategory: '58410-2',
    resultField: 'cbc',
    interpretation: 'critical-high',
    ...MVP_APPROVAL,
    audioFiles: audioFiles('cbc', 'cbc', 'critical-high'),
    plainTextScripts: {
      en: 'Your blood result is very high and needs urgent attention. Please do not leave the clinic without speaking to a doctor or nurse right now.',
      ar: 'نتيجة الدم الخاصة بك مرتفعة جداً وتحتاج إلى عناية عاجلة. يرجى عدم مغادرة العيادة دون التحدث مع الطبيب أو الممرضة الآن.',
      prs: 'نتیجه خون شما بسیار بالا است و نیاز به توجه فوری دارد. لطفاً بدون صحبت با پزشک یا پرستار همین الان از کلینیک نروید.',
      ps: 'ستاسو د وینې پایله خورا لوړه ده او فوري پاملرنې ته اړتیا لري. مهرباني وکړئ له کلینیک ووځئ پرته له دې چې اوس سمدستي له ډاکتر یا نرس سره خبرې وکړئ.',
    },
  },

  // ── Lipid Panel (57698-3) ────────────────────────────────────────────────────
  {
    id: 'lipid-normal',
    testCategory: '57698-3',
    resultField: 'lipidPanel',
    interpretation: 'normal',
    ...MVP_APPROVAL,
    audioFiles: audioFiles('lipid', 'lipidPanel', 'normal'),
    plainTextScripts: {
      en: 'Your heart fat check is in the healthy range. Keep up your healthy habits. Your doctor will still discuss these results with you.',
      ar: 'فحص دهون القلب الخاص بك في النطاق الصحي. حافظ على عاداتك الصحية. سيناقش طبيبك معك هذه النتائج.',
      prs: 'آزمایش چربی قلب شما در محدوده سالم است. عادات سالم خود را ادامه دهید. پزشک شما این نتایج را با شما بحث خواهد کرد.',
      ps: 'ستاسو د زړه د غوړ معاینه د روغتیا د حد پروت دی. خپلې روغتیایي عادتونه وساتئ. ستاسو ډاکتر به دا پایلې ستاسو سره بحث کړي.',
    },
  },
  {
    id: 'lipid-low',
    testCategory: '57698-3',
    resultField: 'lipidPanel',
    interpretation: 'low',
    ...MVP_APPROVAL,
    audioFiles: audioFiles('lipid', 'lipidPanel', 'low'),
    plainTextScripts: {
      en: 'Your good cholesterol is a little low. Eating healthy food and walking regularly can help. Your doctor will discuss this with you.',
      ar: 'نسبة الكوليسترول الجيد لديك منخفضة قليلاً. تناول الطعام الصحي والمشي المنتظم يمكن أن يساعد. سيناقش طبيبك معك ذلك.',
      prs: 'کلسترول خوب شما کمی پایین است. خوردن غذای سالم و پیاده‌روی منظم می‌تواند کمک کند. پزشک شما این را با شما بحث خواهد کرد.',
      ps: 'ستاسو ښه کولیسترول لږ ټیټ دی. د روغ خواړو خوړل او منظم پلی کول مرسته کولی شي. ستاسو ډاکتر به دا ستاسو سره بحث کړي.',
    },
  },
  {
    id: 'lipid-high',
    testCategory: '57698-3',
    resultField: 'lipidPanel',
    interpretation: 'high',
    ...MVP_APPROVAL,
    audioFiles: audioFiles('lipid', 'lipidPanel', 'high'),
    plainTextScripts: {
      en: 'Your cholesterol is a little high. This means your heart may need extra care. Your doctor will talk with you about diet and possibly medicine.',
      ar: 'مستوى الكوليسترول لديك مرتفع قليلاً. هذا يعني قلبك قد يحتاج رعاية إضافية. سيتحدث معك طبيبك عن النظام الغذائي وربما الدواء.',
      prs: 'کلسترول شما کمی بالا است. این به این معنی است که قلب شما ممکن است به مراقبت بیشتری نیاز داشته باشد. پزشک شما درباره رژیم غذایی و احتمالاً دارو با شما صحبت خواهد کرد.',
      ps: 'ستاسو کولیسترول لږ لوړ دی. دا پدې مانا ده چې ستاسو زړه ممکن اضافي پاملرنې ته اړتیا ولري. ستاسو ډاکتر به ستاسو سره د خواړو او ممکن دوا د بحث کوي.',
    },
  },
  {
    id: 'lipid-critical-low',
    testCategory: '57698-3',
    resultField: 'lipidPanel',
    interpretation: 'critical-low',
    ...MVP_APPROVAL,
    audioFiles: audioFiles('lipid', 'lipidPanel', 'critical-low'),
    plainTextScripts: {
      en: 'Your cholesterol level is very low and your doctor needs to check on you today. Please wait to see the doctor before leaving.',
      ar: 'مستوى الكوليسترول لديك منخفض جداً وطبيبك بحاجة لفحصك اليوم. يرجى الانتظار لرؤية الطبيب قبل المغادرة.',
      prs: 'سطح کلسترول شما بسیار پایین است و پزشک شما باید امروز شما را معاینه کند. لطفاً قبل از رفتن منتظر دیدن پزشک بمانید.',
      ps: 'ستاسو د کولیسترول کچه خورا ټیټه ده او ستاسو ډاکتر اړتیا لري چې نن ستاسو ته وګوري. مهرباني وکړئ له تللو دمخه د ډاکتر لیدلو انتظار وکړئ.',
    },
  },
  {
    id: 'lipid-critical-high',
    testCategory: '57698-3',
    resultField: 'lipidPanel',
    interpretation: 'critical-high',
    ...MVP_APPROVAL,
    audioFiles: audioFiles('lipid', 'lipidPanel', 'critical-high'),
    plainTextScripts: {
      en: 'Your cholesterol is very high. This is not safe for your heart. Please speak with the doctor right now before you leave.',
      ar: 'مستوى الكوليسترول لديك مرتفع جداً. هذا ليس آمناً لقلبك. يرجى التحدث مع الطبيب الآن قبل مغادرتك.',
      prs: 'کلسترول شما بسیار بالا است. این برای قلب شما ایمن نیست. لطفاً همین الان قبل از رفتن با پزشک صحبت کنید.',
      ps: 'ستاسو کولیسترول خورا لوړ دی. دا ستاسو د زړه لپاره خوندي ندی. مهرباني وکړئ له تللو دمخه سمدستي له ډاکتر سره خبرې وکړئ.',
    },
  },

  // ── HbA1c (4548-4) ───────────────────────────────────────────────────────────
  {
    id: 'hba1c-normal',
    testCategory: '4548-4',
    resultField: 'hba1c',
    interpretation: 'normal',
    ...MVP_APPROVAL,
    audioFiles: audioFiles('hba1c', 'hba1c', 'normal'),
    plainTextScripts: {
      en: 'Your sugar control over the last three months has been good. Keep eating well and staying active. Your doctor will review this with you.',
      ar: 'تحكمك بالسكر خلال الأشهر الثلاثة الماضية كان جيداً. استمر في الأكل الصحي والنشاط البدني. سيراجع طبيبك ذلك معك.',
      prs: 'کنترل قند شما در سه ماه گذشته خوب بوده است. خوردن خوب و فعال بودن را ادامه دهید. پزشک شما این را با شما مرور خواهد کرد.',
      ps: 'ستاسو د وروستیو درو میاشتو کې د شکر کنترول ښه و. د روغ خواړو خوړل او فعاله پاتې کیدل دوام ورکړئ. ستاسو ډاکتر به دا ستاسو سره مرور کړي.',
    },
  },
  {
    id: 'hba1c-low',
    testCategory: '4548-4',
    resultField: 'hba1c',
    interpretation: 'low',
    ...MVP_APPROVAL,
    audioFiles: audioFiles('hba1c', 'hba1c', 'low'),
    plainTextScripts: {
      en: 'Your sugar level has been a little low over the past months. Your doctor will discuss your diet or medicines to help keep your sugar balanced.',
      ar: 'كان مستوى السكر لديك منخفضاً قليلاً خلال الأشهر الماضية. سيناقش طبيبك نظامك الغذائي أو أدويتك للمساعدة في الحفاظ على توازن السكر.',
      prs: 'سطح قند شما در ماه‌های گذشته کمی پایین بوده است. پزشک شما درباره رژیم غذایی یا داروهای شما برای کمک به تعادل قند صحبت خواهد کرد.',
      ps: 'ستاسو د شکر کچه د تیرو میاشتو پر مهال لږ ټیټه وه. ستاسو ډاکتر به ستاسو د خواړو یا درملو بحث کوي ترڅو ستاسو شکر متوازن وساتي.',
    },
  },
  {
    id: 'hba1c-high',
    testCategory: '4548-4',
    resultField: 'hba1c',
    interpretation: 'high',
    ...MVP_APPROVAL,
    audioFiles: audioFiles('hba1c', 'hba1c', 'high'),
    plainTextScripts: {
      en: 'Your sugar has been running high over the last three months. This needs attention. Your doctor will discuss changes to your diet or medicine.',
      ar: 'كان مستوى السكر لديك مرتفعاً خلال الأشهر الثلاثة الماضية. هذا يحتاج إلى اهتمام. سيناقش طبيبك تغييرات في نظامك الغذائي أو دوائك.',
      prs: 'قند شما در سه ماه گذشته بالا بوده است. این نیاز به توجه دارد. پزشک شما درباره تغییرات در رژیم غذایی یا داروی شما صحبت خواهد کرد.',
      ps: 'ستاسو شکر د وروستیو درو میاشتو کې لوړ و. دا پاملرنې ته اړتیا لري. ستاسو ډاکتر به ستاسو د خواړو یا درملو کې بدلونونو بحث وکړي.',
    },
  },
  {
    id: 'hba1c-critical-low',
    testCategory: '4548-4',
    resultField: 'hba1c',
    interpretation: 'critical-low',
    ...MVP_APPROVAL,
    audioFiles: audioFiles('hba1c', 'hba1c', 'critical-low'),
    plainTextScripts: {
      en: 'Your sugar control is dangerously low. Please talk to the doctor right now. Do not leave without seeing a doctor.',
      ar: 'التحكم في السكر لديك منخفض بشكل خطير. يرجى التحدث مع الطبيب الآن. لا تغادر دون رؤية طبيب.',
      prs: 'کنترل قند شما به طور خطرناکی پایین است. لطفاً همین الان با پزشک صحبت کنید. بدون دیدن پزشک نروید.',
      ps: 'ستاسو د شکر کنترول خطرناک ټیټ دی. مهرباني وکړئ سمدستي له ډاکتر سره خبرې وکړئ. پرته له ډاکتر لیدلو مه ووځئ.',
    },
  },
  {
    id: 'hba1c-critical-high',
    testCategory: '4548-4',
    resultField: 'hba1c',
    interpretation: 'critical-high',
    ...MVP_APPROVAL,
    audioFiles: audioFiles('hba1c', 'hba1c', 'critical-high'),
    plainTextScripts: {
      en: 'Your sugar has been very high for a long time. This is serious. Please talk to the doctor right now before you leave.',
      ar: 'كان مستوى السكر لديك مرتفعاً جداً لفترة طويلة. هذا أمر خطير. يرجى التحدث مع الطبيب الآن قبل مغادرتك.',
      prs: 'قند شما برای مدت طولانی بسیار بالا بوده است. این جدی است. لطفاً همین الان قبل از رفتن با پزشک صحبت کنید.',
      ps: 'ستاسو شکر د اوږدې مودې لپاره خورا لوړ و. دا جدي دي. مهرباني وکړئ له تللو دمخه سمدستي له ډاکتر سره خبرې وکړئ.',
    },
  },

  // ── Basic Metabolic Panel (51990-0) ──────────────────────────────────────────
  {
    id: 'bmp-normal',
    testCategory: '51990-0',
    resultField: 'metabolicPanel',
    interpretation: 'normal',
    ...MVP_APPROVAL,
    audioFiles: audioFiles('bmp', 'metabolicPanel', 'normal'),
    plainTextScripts: {
      en: 'Your body chemistry check is normal. Your kidneys and minerals are working well. No action is needed right now.',
      ar: 'فحص كيمياء الجسم الخاص بك طبيعي. كليتاك والمعادن لديك تعمل بشكل جيد. لا حاجة لأي إجراء في الوقت الحالي.',
      prs: 'آزمایش شیمی بدن شما طبیعی است. کلیه‌ها و مواد معدنی شما خوب کار می‌کنند. در حال حاضر هیچ اقدامی لازم نیست.',
      ps: 'ستاسو د بدن د کیمیا معاینه نورمال ده. ستاسو پیشابي او معدنیات ښه کار کوي. اوس هیڅ عمل ته اړتیا نشته.',
    },
  },
  {
    id: 'bmp-low',
    testCategory: '51990-0',
    resultField: 'metabolicPanel',
    interpretation: 'low',
    ...MVP_APPROVAL,
    audioFiles: audioFiles('bmp', 'metabolicPanel', 'low'),
    plainTextScripts: {
      en: 'One of your body chemistry levels is a little low. Your doctor will check this and may advise you to eat certain foods or take supplements.',
      ar: 'أحد مستويات كيمياء الجسم لديك منخفض قليلاً. سيتحقق طبيبك من ذلك وقد ينصحك بتناول أطعمة معينة أو مكملات غذائية.',
      prs: 'یکی از سطوح شیمی بدن شما کمی پایین است. پزشک شما این را بررسی خواهد کرد و ممکن است به شما توصیه کند که غذاهای خاصی بخورید یا مکمل مصرف کنید.',
      ps: 'ستاسو د بدن د کیمیا یوه کچه لږ ټیټه ده. ستاسو ډاکتر به دا وګوري او ممکن ستاسو ته د ځانګړو خواړو خوړلو یا مکملاتو اخیستلو مشوره درکړي.',
    },
  },
  {
    id: 'bmp-high',
    testCategory: '51990-0',
    resultField: 'metabolicPanel',
    interpretation: 'high',
    ...MVP_APPROVAL,
    audioFiles: audioFiles('bmp', 'metabolicPanel', 'high'),
    plainTextScripts: {
      en: 'One of your body chemistry levels is a little high. This may mean your kidneys or minerals need attention. Your doctor will explain what to do.',
      ar: 'أحد مستويات كيمياء الجسم لديك مرتفع قليلاً. قد يعني ذلك أن كليتيك أو معادنك تحتاج إلى اهتمام. سيشرح طبيبك ما يجب فعله.',
      prs: 'یکی از سطوح شیمی بدن شما کمی بالا است. این ممکن است به این معنی باشد که کلیه‌ها یا مواد معدنی شما نیاز به توجه دارند. پزشک شما توضیح خواهد داد چه باید کرد.',
      ps: 'ستاسو د بدن د کیمیا یوه کچه لږ لوړه ده. دا ممکن پدې مانا وي چې ستاسو پیشابي یا معدنیات پاملرنې ته اړتیا لري. ستاسو ډاکتر به توضیح کړي چې څه وکړئ.',
    },
  },
  {
    id: 'bmp-critical-low',
    testCategory: '51990-0',
    resultField: 'metabolicPanel',
    interpretation: 'critical-low',
    ...MVP_APPROVAL,
    audioFiles: audioFiles('bmp', 'metabolicPanel', 'critical-low'),
    plainTextScripts: {
      en: 'One of your body chemistry levels is dangerously low. Please speak to the doctor immediately. Do not leave without seeing a doctor.',
      ar: 'أحد مستويات كيمياء الجسم لديك منخفض بشكل خطير. يرجى التحدث مع الطبيب فوراً. لا تغادر دون رؤية طبيب.',
      prs: 'یکی از سطوح شیمی بدن شما به طور خطرناکی پایین است. لطفاً فوراً با پزشک صحبت کنید. بدون دیدن پزشک نروید.',
      ps: 'ستاسو د بدن د کیمیا یوه کچه خطرناک ټیټه ده. مهرباني وکړئ سمدستي له ډاکتر سره خبرې وکړئ. پرته له ډاکتر لیدلو مه ووځئ.',
    },
  },
  {
    id: 'bmp-critical-high',
    testCategory: '51990-0',
    resultField: 'metabolicPanel',
    interpretation: 'critical-high',
    ...MVP_APPROVAL,
    audioFiles: audioFiles('bmp', 'metabolicPanel', 'critical-high'),
    plainTextScripts: {
      en: 'One of your body chemistry levels is dangerously high. This may affect your heart or kidneys. Please speak to the doctor right now.',
      ar: 'أحد مستويات كيمياء الجسم لديك مرتفع بشكل خطير. قد يؤثر ذلك على قلبك أو كليتيك. يرجى التحدث مع الطبيب الآن.',
      prs: 'یکی از سطوح شیمی بدن شما به طور خطرناکی بالا است. این ممکن است بر قلب یا کلیه‌های شما تأثیر بگذارد. لطفاً همین الان با پزشک صحبت کنید.',
      ps: 'ستاسو د بدن د کیمیا یوه کچه خطرناک لوړه ده. دا ممکن ستاسو زړه یا پیشابي اغیزه کړي. مهرباني وکړئ سمدستي له ډاکتر سره خبرې وکړئ.',
    },
  },

  // ── Liver Function Tests (24325-3) ───────────────────────────────────────────
  {
    id: 'lfts-normal',
    testCategory: '24325-3',
    resultField: 'liverFunction',
    interpretation: 'normal',
    ...MVP_APPROVAL,
    audioFiles: audioFiles('liver', 'liverFunction', 'normal'),
    plainTextScripts: {
      en: 'Your liver health check is normal. Your liver appears to be working well. No action is needed right now.',
      ar: 'فحص صحة الكبد الخاص بك طبيعي. يبدو أن كبدك يعمل بشكل جيد. لا حاجة لأي إجراء في الوقت الحالي.',
      prs: 'آزمایش سلامت کبد شما طبیعی است. به نظر می‌رسد کبد شما خوب کار می‌کند. در حال حاضر هیچ اقدامی لازم نیست.',
      ps: 'ستاسو د ځیګر د روغتیا معاینه نورمال ده. ستاسو ځیګر ښه کار کوي. اوس هیڅ عمل ته اړتیا نشته.',
    },
  },
  {
    id: 'lfts-low',
    testCategory: '24325-3',
    resultField: 'liverFunction',
    interpretation: 'low',
    ...MVP_APPROVAL,
    audioFiles: audioFiles('liver', 'liverFunction', 'low'),
    plainTextScripts: {
      en: 'One of your liver levels is a little low. This is not usually dangerous, but your doctor will review it with you.',
      ar: 'أحد مستويات الكبد لديك منخفض قليلاً. عادةً ليس خطيراً، لكن طبيبك سيراجعه معك.',
      prs: 'یکی از سطوح کبد شما کمی پایین است. این معمولاً خطرناک نیست، اما پزشک شما آن را با شما مرور خواهد کرد.',
      ps: 'ستاسو د ځیګر یوه کچه لږ ټیټه ده. دا معمولاً خطرناک ندی، مګر ستاسو ډاکتر به دا ستاسو سره مرور کړي.',
    },
  },
  {
    id: 'lfts-high',
    testCategory: '24325-3',
    resultField: 'liverFunction',
    interpretation: 'high',
    ...MVP_APPROVAL,
    audioFiles: audioFiles('liver', 'liverFunction', 'high'),
    plainTextScripts: {
      en: 'Your liver health check shows some stress on your liver. This is not an emergency, but your doctor will want to talk with you about it.',
      ar: 'يُظهر فحص صحة الكبد بعض الضغط على كبدك. هذه ليست حالة طوارئ، لكن طبيبك سيريد التحدث معك عن ذلك.',
      prs: 'آزمایش سلامت کبد شما نشان می‌دهد که کبد شما تحت فشار است. این یک اورژانس نیست، اما پزشک شما می‌خواهد با شما درباره آن صحبت کند.',
      ps: 'ستاسو د ځیګر د روغتیا معاینه ستاسو ځیګر کې ځینې فشار ښیي. دا بیړني حالت ندی، مګر ستاسو ډاکتر غواړي چې ستاسو سره پدې اړه خبرې وکړي.',
    },
  },
  {
    id: 'lfts-critical-low',
    testCategory: '24325-3',
    resultField: 'liverFunction',
    interpretation: 'critical-low',
    ...MVP_APPROVAL,
    audioFiles: audioFiles('liver', 'liverFunction', 'critical-low'),
    plainTextScripts: {
      en: 'Your liver result is very low and needs urgent medical attention. Please see the doctor right now before you leave.',
      ar: 'نتيجة الكبد الخاصة بك منخفضة جداً وتحتاج إلى عناية طبية عاجلة. يرجى رؤية الطبيب الآن قبل مغادرتك.',
      prs: 'نتیجه کبد شما بسیار پایین است و نیاز به مراقبت پزشکی فوری دارد. لطفاً همین الان قبل از رفتن پزشک را ببینید.',
      ps: 'ستاسو د ځیګر پایله خورا ټیټه ده او فوري طبي پاملرنې ته اړتیا لري. مهرباني وکړئ له تللو دمخه سمدستي ډاکتر وګورئ.',
    },
  },
  {
    id: 'lfts-critical-high',
    testCategory: '24325-3',
    resultField: 'liverFunction',
    interpretation: 'critical-high',
    ...MVP_APPROVAL,
    audioFiles: audioFiles('liver', 'liverFunction', 'critical-high'),
    plainTextScripts: {
      en: 'Your liver is showing signs of serious stress. Please speak to the doctor right now — this needs urgent attention.',
      ar: 'يُظهر كبدك علامات ضغط شديد. يرجى التحدث مع الطبيب الآن — هذا يحتاج إلى اهتمام عاجل.',
      prs: 'کبد شما نشانه‌هایی از استرس جدی نشان می‌دهد. لطفاً همین الان با پزشک صحبت کنید — این نیاز به توجه فوری دارد.',
      ps: 'ستاسو ځیګر د جدي فشار نښې ښیي. مهرباني وکړئ سمدستي له ډاکتر سره خبرې وکړئ — دا فوري پاملرنې ته اړتیا لري.',
    },
  },

  // ── TSH / Thyroid (3016-3) ────────────────────────────────────────────────────
  {
    id: 'tsh-normal',
    testCategory: '3016-3',
    resultField: 'tsh',
    interpretation: 'normal',
    ...MVP_APPROVAL,
    audioFiles: audioFiles('tsh', 'tsh', 'normal'),
    plainTextScripts: {
      en: 'Your thyroid gland is working normally. No action is needed right now. Your doctor will confirm this at your next visit.',
      ar: 'غدتك الدرقية تعمل بشكل طبيعي. لا حاجة لأي إجراء في الوقت الحالي. سيؤكد طبيبك ذلك في زيارتك القادمة.',
      prs: 'غده تیروئید شما به طور طبیعی کار می‌کند. در حال حاضر هیچ اقدامی لازم نیست. پزشک شما این را در ملاقات بعدی تأیید خواهد کرد.',
      ps: 'ستاسو د تیروید غده نورمال کار کوي. اوس هیڅ عمل ته اړتیا نشته. ستاسو ډاکتر به دا ستاسو د راتلونکي مراجعت پرمهال تایید کړي.',
    },
  },
  {
    id: 'tsh-low',
    testCategory: '3016-3',
    resultField: 'tsh',
    interpretation: 'low',
    ...MVP_APPROVAL,
    audioFiles: audioFiles('tsh', 'tsh', 'low'),
    plainTextScripts: {
      en: 'Your thyroid gland is working a little too fast. This can make you feel tired or anxious. Your doctor will discuss treatment options with you.',
      ar: 'غدتك الدرقية تعمل بسرعة أكبر قليلاً. هذا قد يجعلك تشعر بالتعب أو القلق. سيناقش طبيبك معك خيارات العلاج.',
      prs: 'غده تیروئید شما کمی بیش از حد سریع کار می‌کند. این می‌تواند باعث خستگی یا اضطراب شود. پزشک شما گزینه‌های درمانی را با شما بحث خواهد کرد.',
      ps: 'ستاسو د تیروید غده لږ ډیره ګړندۍ کار کوي. دا کولی شي تاسو ستړي یا اندیښمن احساس کړئ. ستاسو ډاکتر به د درملنې اختیارونه ستاسو سره بحث کړي.',
    },
  },
  {
    id: 'tsh-high',
    testCategory: '3016-3',
    resultField: 'tsh',
    interpretation: 'high',
    ...MVP_APPROVAL,
    audioFiles: audioFiles('tsh', 'tsh', 'high'),
    plainTextScripts: {
      en: 'Your thyroid gland may not be working fast enough. This can make you feel tired or cold. Your doctor will discuss next steps with you.',
      ar: 'قد لا تعمل غدتك الدرقية بسرعة كافية. هذا قد يجعلك تشعر بالتعب أو البرد. سيناقش طبيبك معك الخطوات التالية.',
      prs: 'غده تیروئید شما ممکن است به اندازه کافی سریع کار نکند. این می‌تواند باعث خستگی یا احساس سرما شود. پزشک شما مراحل بعدی را با شما بحث خواهد کرد.',
      ps: 'ستاسو د تیروید غده ممکن کافي ګړندۍ کار ونه کړي. دا کولی شي تاسو ستړي یا سوړ احساس کړئ. ستاسو ډاکتر به راتلونکي ګامونه ستاسو سره بحث کړي.',
    },
  },
  {
    id: 'tsh-critical-low',
    testCategory: '3016-3',
    resultField: 'tsh',
    interpretation: 'critical-low',
    ...MVP_APPROVAL,
    audioFiles: audioFiles('tsh', 'tsh', 'critical-low'),
    plainTextScripts: {
      en: 'Your thyroid result is very low and needs urgent attention. This can affect your heart. Please talk to the doctor right now.',
      ar: 'نتيجة الغدة الدرقية لديك منخفضة جداً وتحتاج إلى عناية عاجلة. هذا قد يؤثر على قلبك. يرجى التحدث مع الطبيب الآن.',
      prs: 'نتیجه تیروئید شما بسیار پایین است و نیاز به توجه فوری دارد. این می‌تواند بر قلب شما تأثیر بگذارد. لطفاً همین الان با پزشک صحبت کنید.',
      ps: 'ستاسو د تیروید پایله خورا ټیټه ده او فوري پاملرنې ته اړتیا لري. دا کولی شي ستاسو زړه اغیزه کړي. مهرباني وکړئ سمدستي له ډاکتر سره خبرې وکړئ.',
    },
  },
  {
    id: 'tsh-critical-high',
    testCategory: '3016-3',
    resultField: 'tsh',
    interpretation: 'critical-high',
    ...MVP_APPROVAL,
    audioFiles: audioFiles('tsh', 'tsh', 'critical-high'),
    plainTextScripts: {
      en: 'Your thyroid result is very high. Your thyroid gland needs urgent medical help. Please see the doctor right now before you leave.',
      ar: 'نتيجة الغدة الدرقية لديك مرتفعة جداً. غدتك الدرقية تحتاج إلى مساعدة طبية عاجلة. يرجى رؤية الطبيب الآن قبل مغادرتك.',
      prs: 'نتیجه تیروئید شما بسیار بالا است. غده تیروئید شما نیاز به کمک پزشکی فوری دارد. لطفاً همین الان قبل از رفتن پزشک را ببینید.',
      ps: 'ستاسو د تیروید پایله خورا لوړه ده. ستاسو د تیروید غده فوري طبي مرستې ته اړتیا لري. مهرباني وکړئ له تللو دمخه سمدستي ډاکتر وګورئ.',
    },
  },

  // ── Urinalysis (24356-8) ─────────────────────────────────────────────────────
  {
    id: 'ua-normal',
    testCategory: '24356-8',
    resultField: 'urinalysis',
    interpretation: 'normal',
    ...MVP_APPROVAL,
    audioFiles: audioFiles('ua', 'urinalysis', 'normal'),
    plainTextScripts: {
      en: 'Your urine test is normal. Your kidneys and bladder appear to be working well. No action is needed right now.',
      ar: 'فحص البول الخاص بك طبيعي. تبدو كليتاك ومثانتك تعملان بشكل جيد. لا حاجة لأي إجراء في الوقت الحالي.',
      prs: 'آزمایش ادرار شما طبیعی است. کلیه‌ها و مثانه شما به خوبی کار می‌کنند. در حال حاضر هیچ اقدامی لازم نیست.',
      ps: 'ستاسو د پیشاب معاینه نورمال ده. ستاسو پیشابي او مثانه ښه کار کوي. اوس هیڅ عمل ته اړتیا نشته.',
    },
  },
  {
    id: 'ua-low',
    testCategory: '24356-8',
    resultField: 'urinalysis',
    interpretation: 'low',
    ...MVP_APPROVAL,
    audioFiles: audioFiles('ua', 'urinalysis', 'low'),
    plainTextScripts: {
      en: 'Your urine check has one low reading. Your doctor will review this and may suggest you drink more water or return for another test.',
      ar: 'يوجد قراءة منخفضة في فحص البول الخاص بك. سيراجع طبيبك ذلك وقد يقترح عليك شرب المزيد من الماء أو العودة لإجراء اختبار آخر.',
      prs: 'آزمایش ادرار شما یک قرائت پایین دارد. پزشک شما این را بررسی خواهد کرد و ممکن است پیشنهاد دهد بیشتر آب بنوشید یا برای آزمایش دیگری برگردید.',
      ps: 'ستاسو د پیشاب معاینه یو ټیټ لوستل لري. ستاسو ډاکتر به دا وګوري او ممکن وړاندیز وکړي چې ډیر اوبه وڅښئ یا بل معاینه لپاره راشئ.',
    },
  },
  {
    id: 'ua-high',
    testCategory: '24356-8',
    resultField: 'urinalysis',
    interpretation: 'high',
    ...MVP_APPROVAL,
    audioFiles: audioFiles('ua', 'urinalysis', 'high'),
    plainTextScripts: {
      en: 'Your urine test shows something that needs checking. It could be a minor infection or kidney issue. Your doctor will advise you.',
      ar: 'يُظهر فحص البول شيئاً يحتاج إلى فحص. قد يكون عدوى بسيطة أو مشكلة في الكلى. سينصحك طبيبك.',
      prs: 'آزمایش ادرار شما چیزی را نشان می‌دهد که نیاز به بررسی دارد. ممکن است عفونت خفیف یا مشکل کلیوی باشد. پزشک شما به شما توصیه خواهد کرد.',
      ps: 'ستاسو د پیشاب معاینه یو شی ښیي چې چک کیدو ته اړتیا لري. دا ممکن یوه کوچنۍ انفیکشن یا د پیشابي ستونزه وي. ستاسو ډاکتر به تاسو ته مشوره درکړي.',
    },
  },
  {
    id: 'ua-critical-low',
    testCategory: '24356-8',
    resultField: 'urinalysis',
    interpretation: 'critical-low',
    ...MVP_APPROVAL,
    audioFiles: audioFiles('ua', 'urinalysis', 'critical-low'),
    plainTextScripts: {
      en: 'Your urine result is very low and your doctor needs to check you right away. Please wait to see the doctor before leaving.',
      ar: 'نتيجة البول لديك منخفضة جداً وطبيبك بحاجة لفحصك على الفور. يرجى الانتظار لرؤية الطبيب قبل المغادرة.',
      prs: 'نتیجه ادرار شما بسیار پایین است و پزشک شما باید فوراً شما را معاینه کند. لطفاً قبل از رفتن منتظر دیدن پزشک بمانید.',
      ps: 'ستاسو د پیشاب پایله خورا ټیټه ده او ستاسو ډاکتر اړتیا لري چې سمدستي تاسو وګوري. مهرباني وکړئ له تللو دمخه د ډاکتر لیدلو انتظار وکړئ.',
    },
  },
  {
    id: 'ua-critical-high',
    testCategory: '24356-8',
    resultField: 'urinalysis',
    interpretation: 'critical-high',
    ...MVP_APPROVAL,
    audioFiles: audioFiles('ua', 'urinalysis', 'critical-high'),
    plainTextScripts: {
      en: 'Your urine test is showing a serious problem. This needs urgent care. Please speak to the doctor right now — do not leave.',
      ar: 'يُظهر فحص البول مشكلة خطيرة. هذا يحتاج إلى رعاية عاجلة. يرجى التحدث مع الطبيب الآن — لا تغادر.',
      prs: 'آزمایش ادرار شما یک مشکل جدی را نشان می‌دهد. این نیاز به مراقبت فوری دارد. لطفاً همین الان با پزشک صحبت کنید — نروید.',
      ps: 'ستاسو د پیشاب معاینه یوه جدي ستونزه ښیي. دا فوري پاملرنې ته اړتیا لري. مهرباني وکړئ سمدستي له ډاکتر سره خبرې وکړئ — مه ووځئ.',
    },
  },

  // ── Fasting Glucose (1558-6) ──────────────────────────────────────────────────
  {
    id: 'fbs-normal',
    testCategory: '1558-6',
    resultField: 'fastingGlucose',
    interpretation: 'normal',
    ...MVP_APPROVAL,
    audioFiles: audioFiles('fbs', 'fastingGlucose', 'normal'),
    plainTextScripts: {
      en: 'Your fasting sugar level is in the healthy range. Keep eating well and staying active. Your doctor will confirm this result.',
      ar: 'مستوى السكر الصائم لديك في النطاق الصحي. استمر في الأكل الصحي والنشاط البدني. سيؤكد طبيبك هذه النتيجة.',
      prs: 'سطح قند ناشتای شما در محدوده سالم است. خوردن خوب و فعال بودن را ادامه دهید. پزشک شما این نتیجه را تأیید خواهد کرد.',
      ps: 'ستاسو د روژې د شکر کچه د روغتیا د حد پروت ده. د روغ خواړو خوړل او فعاله پاتې کیدل دوام ورکړئ. ستاسو ډاکتر به دا پایله تایید کړي.',
    },
  },
  {
    id: 'fbs-low',
    testCategory: '1558-6',
    resultField: 'fastingGlucose',
    interpretation: 'low',
    ...MVP_APPROVAL,
    audioFiles: audioFiles('fbs', 'fastingGlucose', 'low'),
    plainTextScripts: {
      en: 'Your fasting sugar is a little low. Please eat or drink something sweet right away. Tell the nurse or doctor before you leave.',
      ar: 'سكر الصيام لديك منخفض قليلاً. يرجى تناول شيء حلو على الفور. أخبر الممرضة أو الطبيب قبل مغادرتك.',
      prs: 'قند ناشتای شما کمی پایین است. لطفاً فوراً چیزی شیرین بخورید یا بنوشید. قبل از رفتن به پرستار یا پزشک بگویید.',
      ps: 'ستاسو د روژې شکر لږ ټیټ دی. مهرباني وکړئ سمدستي یو شیرین شی وخورئ یا وڅښئ. له تللو دمخه نرس یا ډاکتر ته ووایئ.',
    },
  },
  {
    id: 'fbs-high',
    testCategory: '1558-6',
    resultField: 'fastingGlucose',
    interpretation: 'high',
    ...MVP_APPROVAL,
    audioFiles: audioFiles('fbs', 'fastingGlucose', 'high'),
    plainTextScripts: {
      en: 'Your fasting sugar is a little high. This may be a sign of diabetes or pre-diabetes. Your doctor will discuss diet and possibly medicine with you.',
      ar: 'سكر الصيام لديك مرتفع قليلاً. هذا قد يكون علامة على داء السكري أو ما قبل السكري. سيناقش طبيبك معك النظام الغذائي وربما الدواء.',
      prs: 'قند ناشتای شما کمی بالا است. این ممکن است نشانه دیابت یا پیش‌دیابت باشد. پزشک شما رژیم غذایی و احتمالاً دارو را با شما بحث خواهد کرد.',
      ps: 'ستاسو د روژې شکر لږ لوړ دی. دا ممکن د شکرۍ مرض یا د شکرۍ مرض دمخه نښه وي. ستاسو ډاکتر به ستاسو سره د خواړو او ممکن دوا بحث کړي.',
    },
  },
  {
    id: 'fbs-critical-low',
    testCategory: '1558-6',
    resultField: 'fastingGlucose',
    interpretation: 'critical-low',
    ...MVP_APPROVAL,
    audioFiles: audioFiles('fbs', 'fastingGlucose', 'critical-low'),
    plainTextScripts: {
      en: 'Your sugar is dangerously low. Please eat or drink something sweet immediately and tell the nurse or doctor right away. Do not leave.',
      ar: 'سكرك منخفض بشكل خطير. يرجى تناول شيء حلو فوراً وإخبار الممرضة أو الطبيب على الفور. لا تغادر.',
      prs: 'قند شما به طور خطرناکی پایین است. لطفاً فوراً چیزی شیرین بخورید یا بنوشید و بلافاصله به پرستار یا پزشک بگویید. نروید.',
      ps: 'ستاسو شکر خطرناک ټیټ دی. مهرباني وکړئ سمدستي یو شیرین شی وخورئ یا وڅښئ او سمدستي نرس یا ډاکتر ته ووایئ. مه ووځئ.',
    },
  },
  {
    id: 'fbs-critical-high',
    testCategory: '1558-6',
    resultField: 'fastingGlucose',
    interpretation: 'critical-high',
    ...MVP_APPROVAL,
    audioFiles: audioFiles('fbs', 'fastingGlucose', 'critical-high'),
    plainTextScripts: {
      en: 'Your fasting sugar is very high. This is a medical emergency. Please speak to the doctor immediately — do not leave the clinic.',
      ar: 'سكر الصيام لديك مرتفع جداً. هذه حالة طوارئ طبية. يرجى التحدث مع الطبيب فوراً — لا تغادر العيادة.',
      prs: 'قند ناشتای شما بسیار بالا است. این یک اورژانس پزشکی است. لطفاً فوراً با پزشک صحبت کنید — از کلینیک نروید.',
      ps: 'ستاسو د روژې شکر خورا لوړ دی. دا یوه طبي بیړه ده. مهرباني وکړئ سمدستي له ډاکتر سره خبرې وکړئ — له کلینیک مه ووځئ.',
    },
  },
]
