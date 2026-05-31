/**
 * Trigger Pattern Engine — Story 53.1 (AC: 1, 6, 8, 9)
 *
 * Evaluates deterministic threshold-based trigger rules against structured
 * result field values and returns matching knowledge cards.
 *
 * Design notes:
 * - O(rules × conditions) — with ~20 rules and ~3 conditions, negligible cost.
 * - No AI/ML involvement. Pure threshold arithmetic.
 * - Returns empty array when nothing matches — no "no results" sentinel.
 * - PHI safety: receives only numeric field values keyed by LOINC field code.
 *   Never receives patient identifiers, names, or clinical notes.
 */

import {
  KNOWLEDGE_CARD_REGISTRY,
  TRIGGER_RULES,
  type KnowledgeCard,
  type TriggerCondition,
} from '@/lib/knowledge-cards'

// ---------------------------------------------------------------------------
// Condition evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate a single TriggerCondition against a numeric value.
 * Returns false if the value is null/undefined (field not yet entered).
 */
function evaluateCondition(
  condition: TriggerCondition,
  fieldValue: number | string | null | undefined,
): boolean {
  if (condition.operator === 'present') {
    return fieldValue !== null && fieldValue !== undefined && fieldValue !== ''
  }

  // All remaining operators require a numeric value
  if (fieldValue === null || fieldValue === undefined || fieldValue === '') return false
  const num = typeof fieldValue === 'number' ? fieldValue : parseFloat(String(fieldValue))
  if (isNaN(num)) return false

  switch (condition.operator) {
    case 'gt':
      return condition.value !== undefined && num > condition.value
    case 'lt':
      return condition.value !== undefined && num < condition.value
    case 'gte':
      return condition.value !== undefined && num >= condition.value
    case 'lte':
      return condition.value !== undefined && num <= condition.value
    case 'eq':
      return condition.value !== undefined && num === condition.value
    case 'between':
      return (
        condition.valueRange !== undefined &&
        num >= condition.valueRange.min &&
        num <= condition.valueRange.max
      )
    default:
      return false
  }
}

// ---------------------------------------------------------------------------
// Template LOINC compatibility check
// ---------------------------------------------------------------------------

/**
 * Returns true if the rule is compatible with the given template LOINC code.
 * Rules with '*' in their templateLoincCodes apply to all templates.
 */
function ruleAppliesToTemplate(
  ruleLoincCodes: string[],
  templateLoincCode: string,
): boolean {
  return ruleLoincCodes.includes('*') || ruleLoincCodes.includes(templateLoincCode)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate all trigger rules against the given result field values and
 * return the set of matching KnowledgeCards.
 *
 * @param resultValues      - Map of LOINC field code → numeric/string/null value
 * @param templateLoincCode - The top-level LOINC code of the active result template
 * @returns                 Array of matching KnowledgeCards (may be empty — never null)
 */
export function evaluateKnowledgeCardTriggers(
  resultValues: Record<string, number | string | null>,
  templateLoincCode: string,
): KnowledgeCard[] {
  const matchedCards: KnowledgeCard[] = []
  const seenCardIds = new Set<string>()

  for (const rule of TRIGGER_RULES) {
    // Skip rules that don't apply to this template
    if (!ruleAppliesToTemplate(rule.templateLoincCodes, templateLoincCode)) continue

    // All conditions must match (AND logic)
    const allMatch = rule.conditions.every((condition) => {
      const fieldValue = resultValues[condition.fieldCode] ?? null
      return evaluateCondition(condition, fieldValue)
    })

    if (!allMatch) continue

    // Deduplicate: a card can only appear once even if multiple rules reference it
    if (seenCardIds.has(rule.cardId)) continue

    const card = KNOWLEDGE_CARD_REGISTRY.get(rule.cardId)
    if (!card) continue

    seenCardIds.add(rule.cardId)
    matchedCards.push(card)
  }

  return matchedCards
}

/**
 * Retrieve the trigger rule ID(s) that caused a specific card to be matched.
 * Used by the audit event to record which rule fired.
 *
 * @param cardId            - The KnowledgeCard.id
 * @param resultValues      - Same values passed to evaluateKnowledgeCardTriggers
 * @param templateLoincCode - Same template LOINC passed to evaluateKnowledgeCardTriggers
 * @returns                 Array of matching rule IDs for this card
 */
export function getMatchingRuleIds(
  cardId: string,
  resultValues: Record<string, number | string | null>,
  templateLoincCode: string,
): string[] {
  return TRIGGER_RULES
    .filter((rule) =>
      rule.cardId === cardId &&
      ruleAppliesToTemplate(rule.templateLoincCodes, templateLoincCode) &&
      rule.conditions.every((condition) => {
        const fieldValue = resultValues[condition.fieldCode] ?? null
        return evaluateCondition(condition, fieldValue)
      }),
    )
    .map((rule) => rule.id)
}
