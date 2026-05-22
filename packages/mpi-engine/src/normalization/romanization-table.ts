// ALA-LC Arabic romanization table (simplified for MPI matching).
// Key: Unicode character. Value: Latin romanization string (may be empty to strip).
// Emphatic consonants simplified (ص→s, ض→d, ط→t, ظ→z).
// Extends to Dari/Pashto characters common in Afghan names.
export const ROMANIZATION_TABLE: ReadonlyMap<string, string> = new Map<string, string>([
  // ── Hamza and alif forms ──────────────────────────────────────────────────
  ['\u0621', ''],   // ء  hamza (silent)
  ['\u0622', 'a'],  // آ  alif with madda above
  ['\u0623', 'a'],  // أ  alif with hamza above
  ['\u0624', 'u'],  // ؤ  waw with hamza above
  ['\u0625', 'i'],  // إ  alif with hamza below
  ['\u0626', 'y'],  // ئ  ya with hamza above
  ['\u0627', 'a'],  // ا  alif
  // ── Core consonants ───────────────────────────────────────────────────────
  ['\u0628', 'b'],  // ب  ba
  ['\u0629', 'h'],  // ة  ta marbuta (feminine marker, end-of-word)
  ['\u062A', 't'],  // ت  ta
  ['\u062B', 'th'], // ث  tha (pronounced 's' in Dari — kept 'th' for ALA-LC)
  ['\u062C', 'j'],  // ج  jim
  ['\u062D', 'h'],  // ح  ha (aspirate, simplified to h)
  ['\u062E', 'kh'], // خ  kha
  ['\u062F', 'd'],  // د  dal
  ['\u0630', 'dh'], // ذ  dhal (pronounced 'z' in Dari — kept 'dh' for ALA-LC)
  ['\u0631', 'r'],  // ر  ra
  ['\u0632', 'z'],  // ز  zayn
  ['\u0633', 's'],  // س  sin
  ['\u0634', 'sh'], // ش  shin
  ['\u0635', 's'],  // ص  emphatic sad → s (simplified for MPI)
  ['\u0636', 'd'],  // ض  emphatic dad → d (simplified for MPI)
  ['\u0637', 't'],  // ط  emphatic ta → t (simplified for MPI)
  ['\u0638', 'z'],  // ظ  emphatic za → z (simplified for MPI)
  ['\u0639', ''],   // ع  ayn (silent in simplified romanization)
  ['\u063A', 'gh'], // غ  ghayn
  ['\u0641', 'f'],  // ف  fa
  ['\u0642', 'q'],  // ق  qaf
  ['\u0643', 'k'],  // ك  kaf
  ['\u0644', 'l'],  // ل  lam
  ['\u0645', 'm'],  // م  mim
  ['\u0646', 'n'],  // ن  nun
  ['\u0647', 'h'],  // ه  ha
  ['\u0648', 'w'],  // و  waw
  ['\u0649', 'a'],  // ى  alif maqsura
  ['\u064A', 'y'],  // ي  ya
  // ── Arabic diacritical marks (strip to '') ────────────────────────────────
  ['\u064B', ''],   // ً  tanwin fatha
  ['\u064C', ''],   // ٌ  tanwin damma
  ['\u064D', ''],   // ٍ  tanwin kasra
  ['\u064E', ''],   // َ  fatha
  ['\u064F', ''],   // ُ  damma
  ['\u0650', ''],   // ِ  kasra
  ['\u0651', ''],   // ّ  shadda (doubles consonant — stripped for MPI)
  ['\u0652', ''],   // ْ  sukun
  ['\u0653', ''],   // ٓ  maddah above
  ['\u0654', ''],   // ٔ  hamza above
  ['\u0655', ''],   // ٕ  hamza below
  ['\u0656', ''],   // ٖ  subscript alif
  ['\u0670', ''],   // ٰ  superscript alif (alif wasla)
  ['\u0640', ''],   // ـ  tatweel / kashida (decorative elongation)
  // ── Dari / Pashto extensions ──────────────────────────────────────────────
  ['\u067E', 'p'],  // پ  pe
  ['\u0686', 'ch'], // چ  che
  ['\u0698', 'zh'], // ژ  zhe (zh sound)
  ['\u06AF', 'g'],  // گ  gaf
  ['\u06CC', 'y'],  // ی  Farsi ya (replaces Arabic ya in Dari text)
  ['\u06A9', 'k'],  // ک  Farsi kaf (replaces Arabic kaf in Dari text)
  ['\u06BE', 'h'],  // ھ  do chashmi he
  ['\u06C1', 'h'],  // ہ  he goal (common in Urdu/Pashto names)
  ['\u06C2', 'h'],  // ہٗ  he goal with hamza above
  ['\u06C3', 'h'],  // ۃ  ta marbuta goal
  ['\u06D2', 'y'],  // ے  bariye he (Urdu/Pashto ye, end-of-word)
  ['\u06BA', 'n'],  // ں  noon ghunna (nasalised n)
  ['\u06BB', 'n'],  // ڻ  rnoon (Sindhi/Pashto)
  ['\u0679', 't'],  // ٹ  tte (retroflex t)
  ['\u0688', 'd'],  // ڈ  ddal (retroflex d)
  ['\u0691', 'r'],  // ڑ  rra (retroflex r)
  // ── Lam-alif ligatures ────────────────────────────────────────────────────
  ['\uFEFB', 'la'], // ﻻ  lam-alif (isolated form)
  ['\uFEFC', 'la'], // ﻼ  lam-alif with madda (isolated form)
])
