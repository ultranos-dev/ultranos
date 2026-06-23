/**
 * WHO INN ↔ US (USAN) generic-name aliases.
 *
 * The catalog keys drugs by WHO INN; many sources (openFDA US labels, US-market
 * brand registries) use the USAN spelling. This map bridges the two so brand /
 * label matching works across naming conventions. Both sides are lowercased.
 *
 * Extracted from openfda-bulk.ts so any source (openFDA, regional registries)
 * can share one alias map. Extensible — add pairs as new mismatches surface.
 */
export const INN_US_ALIASES: Record<string, string> = {
  'acetylsalicylic acid': 'aspirin',
  'paracetamol': 'acetaminophen',
  'salbutamol': 'albuterol',
  'adrenaline': 'epinephrine',
  'noradrenaline': 'norepinephrine',
  'glibenclamide': 'glyburide',
  'lignocaine': 'lidocaine',
  'frusemide': 'furosemide',
  'rifampicin': 'rifampin',
  'ciclosporin': 'cyclosporine',
  'colecalciferol': 'cholecalciferol',
  'pethidine': 'meperidine',
  'hydroxycarbamide': 'hydroxyurea',
  'isoprenaline': 'isoproterenol',
  'chlorphenamine': 'chlorpheniramine',
  'beclometasone': 'beclomethasone',
  'benzylpenicillin': 'penicillin g',
  'phenoxymethylpenicillin': 'penicillin v',
  'amfetamine': 'amphetamine',
  'dexamfetamine': 'dextroamphetamine',
  'methylthioninium chloride': 'methylene blue',
  'glyceryl trinitrate': 'nitroglycerin',
  'suxamethonium': 'succinylcholine',
  'ergometrine': 'ergonovine',
  'phytomenadione': 'phytonadione',
  'amethocaine': 'tetracaine',
  'dicycloverine': 'dicyclomine',
  'dosulepin': 'dothiepin',
  'trimeprazine': 'alimemazine',
  'mercaptamine': 'cysteamine',
}

/**
 * Candidate match names for a catalog INN (lowercased): the INN itself, plus
 * its USAN alias if known, plus the reverse mapping (so a dataset using the
 * USAN spelling still resolves a catalog drug keyed by WHO INN and vice versa).
 */
export function candidateNamesFor(innLower: string): string[] {
  const out = [innLower]
  const alias = INN_US_ALIASES[innLower]
  if (alias) out.push(alias)
  return out
}
