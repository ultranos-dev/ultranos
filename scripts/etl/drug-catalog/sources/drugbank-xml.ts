import { createReadStream } from 'node:fs'
import * as saxNs from 'sax'
const sax: typeof import('sax') = (saxNs as any).default ?? saxNs

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DrugBankRecord {
  drugbankId: string
  name: string
  groups: string[]
  atcCodes: string[]
  rxcui: string[]
  mechanismOfAction?: string
  indication?: string
  pharmacokinetics: {
    halfLife?: string
    proteinBinding?: string
    volumeOfDistribution?: string
    clearance?: string
    metabolism?: string
    excretion?: string
  }
  internationalBrands: string[]
  interactions: Array<{ targetDrugbankId: string; name: string; description: string }>
  atcClassByCode: Record<string, string>   // atc code -> most-specific ATC level text
  doseForms: string[]                       // distinct dosage forms
}

// ---------------------------------------------------------------------------
// cleanProse
// ---------------------------------------------------------------------------

/**
 * Strip HTML tags, citation markers (e.g. [L41], [A12345]), collapse
 * whitespace, and trim. Returns undefined for empty/missing input.
 */
export function cleanProse(s: string | undefined): string | undefined {
  if (s == null) return undefined
  const cleaned = s
    .replace(/<\/?\s*[a-zA-Z][^>]*>/g, '')  // strip HTML tags (only those starting with letter or /)
    .replace(/\[[A-Z]\d+\]/g, '')           // strip citation markers like [L41], [A12345]
    .replace(/\s+/g, ' ')                   // collapse whitespace
    .trim()
  return cleaned === '' ? undefined : cleaned
}

// ---------------------------------------------------------------------------
// parseDrugBankXml
// ---------------------------------------------------------------------------

/**
 * Stream-parse a DrugBank full-database XML file using sax.
 * Emits only top-level <drug> elements; nested <drug> stubs inside
 * <pathways> or <reactions> are ignored.
 */
export function parseDrugBankXml(
  path: string,
  onDrug: (r: DrugBankRecord) => void,
): Promise<{ count: number }> {
  return new Promise((resolve, reject) => {
    // -----------------------------------------------------------------------
    // Mutable parser state
    // -----------------------------------------------------------------------

    let count = 0

    // Depth tracking — we track the element depth so we can detect when we're
    // inside a top-level <drug> vs a nested <drug> stub.
    let depth = 0

    // The depth at which a top-level <drug> was opened (-1 = not inside one).
    let drugDepth = -1

    // Current text accumulator for the element we're collecting.
    let textBuf = ''

    // ---- per-drug record being built ----
    let rec: DrugBankRecord | null = null

    // ---- fine-grained context flags ----

    // drugbank-id: true if this id element has primary="true" attribute
    let isDrugbankIdPrimary = false
    // whether we have already found a primary id (so we can fall back to first)
    let primaryIdFound = false

    // which prose field we're currently collecting text for
    type ProseField =
      | 'indication'
      | 'mechanismOfAction'
      | 'halfLife'
      | 'proteinBinding'
      | 'volumeOfDistribution'
      | 'clearance'
      | 'metabolism'
      | 'excretion'
      | null
    let currentProseField: ProseField = null

    // context: inside <groups>
    let inGroups = false

    // context: inside <atc-codes> → <atc-code>
    let inAtcCode = false
    let currentAtcCode: string | null = null
    // temp state for building atcClassByCode per atc-code element
    let currentAtcLevels: Array<{ code: string; text: string }> = []
    let pendingLevelCode: string | null = null

    // context: inside <dosages> (direct child of drug)
    let inDosages = false
    let collectingDoseForm = false
    let doseFormSet = new Set<string>()

    // context: inside <external-identifiers> → <external-identifier>
    let inExternalIdentifiers = false
    let inExternalIdentifier = false
    let currentExtResource = ''
    let currentExtIdentifier = ''
    let collectingExtResource = false
    let collectingExtIdentifier = false

    // context: inside <international-brands> → <international-brand>
    let inInternationalBrands = false
    let inInternationalBrand = false
    let currentBrandName = ''
    let collectingBrandName = false

    // context: inside <drug-interactions> → <drug-interaction>
    let inDrugInteractions = false
    let inDrugInteraction = false
    let currentInteraction: { targetDrugbankId: string; name: string; description: string } | null =
      null
    let collectingInteractionDrugbankId = false
    let collectingInteractionName = false
    let collectingInteractionDescription = false

    // context: inside <pathways> — nested <drug> stubs live here
    let inPathways = false

    // context: collecting top-level drug name
    let collectingDrugName = false

    // context: collecting top-level drugbank-id
    let collectingDrugbankId = false

    // -----------------------------------------------------------------------
    // Helper — local name from a potentially namespace-qualified name
    // -----------------------------------------------------------------------
    const local = (tagName: string): string => {
      const idx = tagName.indexOf(':')
      return idx >= 0 ? tagName.slice(idx + 1) : tagName
    }

    // -----------------------------------------------------------------------
    // Helper — reset per-drug state
    // -----------------------------------------------------------------------
    const resetDrug = () => {
      rec = null
      drugDepth = -1
      isDrugbankIdPrimary = false
      primaryIdFound = false
      currentProseField = null
      inGroups = false
      inAtcCode = false
      currentAtcCode = null
      currentAtcLevels = []
      pendingLevelCode = null
      inDosages = false
      collectingDoseForm = false
      doseFormSet = new Set<string>()
      inExternalIdentifiers = false
      inExternalIdentifier = false
      currentExtResource = ''
      currentExtIdentifier = ''
      collectingExtResource = false
      collectingExtIdentifier = false
      inInternationalBrands = false
      inInternationalBrand = false
      currentBrandName = ''
      collectingBrandName = false
      inDrugInteractions = false
      inDrugInteraction = false
      currentInteraction = null
      collectingInteractionDrugbankId = false
      collectingInteractionName = false
      collectingInteractionDescription = false
      inPathways = false
      collectingDrugName = false
      collectingDrugbankId = false
      textBuf = ''
    }

    // -----------------------------------------------------------------------
    // SAX stream
    // -----------------------------------------------------------------------
    const saxStream = sax.createStream(true /* strict */, { xmlns: true, trim: false })

    saxStream.on('opentag', (tag) => {
      depth++
      const tagLocal = local(tag.name)

      // ---- Detect top-level <drug> ----
      // A top-level drug is the first <drug> we encounter when not already
      // inside a drug (drugDepth === -1).
      if (tagLocal === 'drug' && drugDepth === -1) {
        drugDepth = depth
        rec = {
          drugbankId: '',
          name: '',
          groups: [],
          atcCodes: [],
          rxcui: [],
          pharmacokinetics: {},
          internationalBrands: [],
          interactions: [],
          atcClassByCode: {},
          doseForms: [],
        }
        textBuf = ''
        return
      }

      // If we're not inside a top-level drug, nothing to do.
      if (rec === null) return

      // If we're inside <pathways>, ignore all nested elements (including <drug>).
      if (inPathways) return

      // ---- Context transitions ----
      if (tagLocal === 'pathways') {
        inPathways = true
        return
      }

      if (tagLocal === 'drugbank-id') {
        // Determine if this is the top-level drug id or an interaction target id.
        if (inDrugInteraction && currentInteraction !== null) {
          collectingInteractionDrugbankId = true
        } else if (!inDrugInteraction && depth === drugDepth + 1) {
          // Top-level drug id only when it is a direct child of the drug element.
          // inPathways guard catches pathway stubs; depth guard blocks any other
          // nested drugbank-id (e.g. inside <targets>).
          const attrs = (tag as sax.QualifiedTag).attributes
          // In xmlns mode, attribute values are QualifiedAttribute objects.
          const primaryAttr = attrs['primary']
          isDrugbankIdPrimary =
            primaryAttr != null &&
            (typeof primaryAttr === 'string'
              ? primaryAttr === 'true'
              : (primaryAttr as sax.QualifiedAttribute).value === 'true')
          collectingDrugbankId = true
        }
        textBuf = ''
        return
      }

      if (tagLocal === 'name') {
        // <name> appears at drug level, international-brand level, and
        // drug-interaction level.
        if (inDrugInteraction && currentInteraction !== null) {
          collectingInteractionName = true
        } else if (inInternationalBrand) {
          collectingBrandName = true
        } else if (!inInternationalBrands && !inDrugInteractions && depth === drugDepth + 1) {
          // Top-level drug name — only capture when <name> is a direct child
          // of the top-level <drug>. This prevents nested <name> elements
          // inside <targets>, <enzymes>, <carriers>, <transporters>, etc. from
          // overwriting the real drug name.
          collectingDrugName = true
        }
        textBuf = ''
        return
      }

      if (tagLocal === 'groups' && depth === drugDepth + 1) {
        inGroups = true
        return
      }

      // Prose fields are only captured when they are direct children of the
      // top-level <drug> element (depth === drugDepth + 1). The same tag names
      // can appear nested inside <targets>, <reactions>, etc. and must be ignored.
      if (depth === drugDepth + 1) {
        if (tagLocal === 'indication') {
          currentProseField = 'indication'
          textBuf = ''
          return
        }
        if (tagLocal === 'mechanism-of-action') {
          currentProseField = 'mechanismOfAction'
          textBuf = ''
          return
        }
        if (tagLocal === 'half-life') {
          currentProseField = 'halfLife'
          textBuf = ''
          return
        }
        if (tagLocal === 'protein-binding') {
          currentProseField = 'proteinBinding'
          textBuf = ''
          return
        }
        if (tagLocal === 'volume-of-distribution') {
          currentProseField = 'volumeOfDistribution'
          textBuf = ''
          return
        }
        if (tagLocal === 'clearance') {
          currentProseField = 'clearance'
          textBuf = ''
          return
        }
        if (tagLocal === 'metabolism') {
          currentProseField = 'metabolism'
          textBuf = ''
          return
        }
        if (tagLocal === 'route-of-elimination') {
          currentProseField = 'excretion'
          textBuf = ''
          return
        }
      }

      if (tagLocal === 'atc-codes' && depth === drugDepth + 1) {
        // entering atc-codes block — no specific flag needed
        return
      }
      if (tagLocal === 'atc-code' && depth === drugDepth + 2) {
        const attrs = (tag as sax.QualifiedTag).attributes
        const codeAttr = attrs['code']
        currentAtcCode =
          codeAttr != null
            ? typeof codeAttr === 'string'
              ? codeAttr
              : (codeAttr as sax.QualifiedAttribute).value
            : null
        currentAtcLevels = []
        inAtcCode = true
        return
      }

      if (tagLocal === 'level' && inAtcCode && currentAtcCode !== null) {
        const attrs = (tag as sax.QualifiedTag).attributes
        const codeAttr = attrs['code']
        pendingLevelCode =
          codeAttr != null
            ? typeof codeAttr === 'string'
              ? codeAttr
              : (codeAttr as sax.QualifiedAttribute).value
            : null
        textBuf = ''
        return
      }

      if (tagLocal === 'dosages' && depth === drugDepth + 1) {
        inDosages = true
        return
      }

      if (tagLocal === 'form' && inDosages) {
        collectingDoseForm = true
        textBuf = ''
        return
      }

      if (tagLocal === 'external-identifiers' && depth === drugDepth + 1) {
        inExternalIdentifiers = true
        return
      }
      if (tagLocal === 'external-identifier' && inExternalIdentifiers) {
        inExternalIdentifier = true
        currentExtResource = ''
        currentExtIdentifier = ''
        return
      }
      if (tagLocal === 'resource' && inExternalIdentifier) {
        collectingExtResource = true
        textBuf = ''
        return
      }
      if (tagLocal === 'identifier' && inExternalIdentifier) {
        collectingExtIdentifier = true
        textBuf = ''
        return
      }

      if (tagLocal === 'international-brands') {
        inInternationalBrands = true
        return
      }
      if (tagLocal === 'international-brand' && inInternationalBrands) {
        inInternationalBrand = true
        currentBrandName = ''
        return
      }

      if (tagLocal === 'drug-interactions') {
        inDrugInteractions = true
        return
      }
      if (tagLocal === 'drug-interaction' && inDrugInteractions) {
        inDrugInteraction = true
        currentInteraction = { targetDrugbankId: '', name: '', description: '' }
        return
      }
      if (tagLocal === 'description' && inDrugInteraction && currentInteraction !== null) {
        collectingInteractionDescription = true
        textBuf = ''
        return
      }
    })

    saxStream.on('text', (text) => {
      // Accumulate text whenever we're in a collecting state.
      if (
        collectingDrugbankId ||
        collectingDrugName ||
        currentProseField !== null ||
        inGroups ||
        collectingExtResource ||
        collectingExtIdentifier ||
        collectingBrandName ||
        collectingInteractionDrugbankId ||
        collectingInteractionName ||
        collectingInteractionDescription ||
        pendingLevelCode !== null ||
        collectingDoseForm
      ) {
        textBuf += text
      }
    })

    saxStream.on('closetag', (tagName) => {
      const tagLocal = local(tagName)

      // ---- Emit top-level drug ----
      if (tagLocal === 'drug' && depth === drugDepth) {
        if (rec !== null) {
          // Emit the completed record
          onDrug(rec)
          count++
        }
        resetDrug()
        depth--
        return
      }

      // Decrement depth AFTER the top-level drug check so drugDepth comparison
      // is still valid above.
      depth--

      if (rec === null) return

      // ---- Exit pathways context ----
      if (tagLocal === 'pathways') {
        inPathways = false
        return
      }

      // If we're inside <pathways>, ignore all close tags for nested elements.
      if (inPathways) return

      // ---- Flush collected text for each element ----

      if (collectingDrugbankId && tagLocal === 'drugbank-id') {
        const id = textBuf.trim()
        if (isDrugbankIdPrimary) {
          rec.drugbankId = id
          primaryIdFound = true
        } else if (!primaryIdFound && rec.drugbankId === '') {
          // Fall back to first id if none is marked primary
          rec.drugbankId = id
        }
        collectingDrugbankId = false
        isDrugbankIdPrimary = false
        textBuf = ''
        return
      }

      if (collectingDrugName && tagLocal === 'name') {
        rec.name = textBuf.trim()
        collectingDrugName = false
        textBuf = ''
        return
      }

      if (inGroups && tagLocal === 'group') {
        rec.groups.push(textBuf.trim())
        textBuf = ''
        return
      }
      if (tagLocal === 'groups') {
        inGroups = false
        return
      }

      if (currentProseField !== null) {
        const proseTags: Record<ProseField & string, string> = {
          indication: 'indication',
          mechanismOfAction: 'mechanism-of-action',
          halfLife: 'half-life',
          proteinBinding: 'protein-binding',
          volumeOfDistribution: 'volume-of-distribution',
          clearance: 'clearance',
          metabolism: 'metabolism',
          excretion: 'route-of-elimination',
        }
        if (tagLocal === proseTags[currentProseField]) {
          const cleaned = cleanProse(textBuf)
          switch (currentProseField) {
            case 'indication':
              rec.indication = cleaned
              break
            case 'mechanismOfAction':
              rec.mechanismOfAction = cleaned
              break
            case 'halfLife':
              rec.pharmacokinetics.halfLife = cleaned
              break
            case 'proteinBinding':
              rec.pharmacokinetics.proteinBinding = cleaned
              break
            case 'volumeOfDistribution':
              rec.pharmacokinetics.volumeOfDistribution = cleaned
              break
            case 'clearance':
              rec.pharmacokinetics.clearance = cleaned
              break
            case 'metabolism':
              rec.pharmacokinetics.metabolism = cleaned
              break
            case 'excretion':
              rec.pharmacokinetics.excretion = cleaned
              break
          }
          currentProseField = null
          textBuf = ''
        }
        return
      }

      if (tagLocal === 'level' && inAtcCode && pendingLevelCode !== null) {
        currentAtcLevels.push({ code: pendingLevelCode, text: textBuf })
        pendingLevelCode = null
        textBuf = ''
        return
      }

      if (tagLocal === 'atc-code' && inAtcCode) {
        if (currentAtcCode !== null) {
          rec.atcCodes.push(currentAtcCode)
          if (currentAtcLevels.length > 0) {
            const best = currentAtcLevels.reduce((a, b) => b.code.length > a.code.length ? b : a)
            rec.atcClassByCode[currentAtcCode] = best.text.trim()
          }
        }
        inAtcCode = false
        currentAtcCode = null
        currentAtcLevels = []
        return
      }

      if (collectingDoseForm && tagLocal === 'form') {
        const form = textBuf.trim()
        if (form !== '') doseFormSet.add(form)
        collectingDoseForm = false
        textBuf = ''
        return
      }

      if (tagLocal === 'dosages' && inDosages) {
        rec.doseForms = [...doseFormSet]
        inDosages = false
        return
      }

      if (collectingExtResource && tagLocal === 'resource') {
        currentExtResource = textBuf.trim()
        collectingExtResource = false
        textBuf = ''
        return
      }
      if (collectingExtIdentifier && tagLocal === 'identifier') {
        currentExtIdentifier = textBuf.trim()
        collectingExtIdentifier = false
        textBuf = ''
        return
      }
      if (inExternalIdentifier && tagLocal === 'external-identifier') {
        if (currentExtResource === 'RxCUI' && currentExtIdentifier !== '') {
          rec.rxcui.push(currentExtIdentifier)
        }
        inExternalIdentifier = false
        currentExtResource = ''
        currentExtIdentifier = ''
        return
      }
      if (tagLocal === 'external-identifiers') {
        inExternalIdentifiers = false
        return
      }

      if (collectingBrandName && tagLocal === 'name' && inInternationalBrand) {
        currentBrandName = textBuf.trim()
        collectingBrandName = false
        textBuf = ''
        return
      }
      if (inInternationalBrand && tagLocal === 'international-brand') {
        if (currentBrandName !== '') {
          rec.internationalBrands.push(currentBrandName)
        }
        inInternationalBrand = false
        currentBrandName = ''
        return
      }
      if (tagLocal === 'international-brands') {
        inInternationalBrands = false
        return
      }

      if (
        collectingInteractionDrugbankId &&
        tagLocal === 'drugbank-id' &&
        inDrugInteraction &&
        currentInteraction !== null
      ) {
        currentInteraction.targetDrugbankId = textBuf.trim()
        collectingInteractionDrugbankId = false
        textBuf = ''
        return
      }
      if (
        collectingInteractionName &&
        tagLocal === 'name' &&
        inDrugInteraction &&
        currentInteraction !== null
      ) {
        currentInteraction.name = textBuf.trim()
        collectingInteractionName = false
        textBuf = ''
        return
      }
      if (
        collectingInteractionDescription &&
        tagLocal === 'description' &&
        inDrugInteraction &&
        currentInteraction !== null
      ) {
        currentInteraction.description = cleanProse(textBuf) ?? ''
        collectingInteractionDescription = false
        textBuf = ''
        return
      }
      if (inDrugInteraction && tagLocal === 'drug-interaction' && currentInteraction !== null) {
        rec.interactions.push(currentInteraction)
        currentInteraction = null
        inDrugInteraction = false
        return
      }
      if (tagLocal === 'drug-interactions') {
        inDrugInteractions = false
        return
      }
    })

    saxStream.on('end', () => {
      resolve({ count })
    })

    saxStream.on('error', (err) => {
      reject(err)
    })

    const rs = createReadStream(path)
    rs.on('error', reject)
    rs.pipe(saxStream)
  })
}
