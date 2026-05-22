export const AFGHAN_PROVINCES = [
  'Badakhshan', 'Badghis',   'Baghlan',  'Balkh',    'Bamyan',
  'Daykundi',   'Farah',     'Faryab',   'Ghazni',   'Ghor',
  'Helmand',    'Herat',     'Jawzjan',  'Kabul',    'Kandahar',
  'Kapisa',     'Khost',     'Kunar',    'Kunduz',   'Laghman',
  'Logar',      'Nangarhar', 'Nimroz',   'Nuristan', 'Paktia',
  'Paktika',    'Panjshir',  'Parwan',   'Samangan', 'Sar-e-Pol',
  'Takhar',     'Urozgan',   'Wardak',   'Zabul',
] as const

export type AfghanProvince = typeof AFGHAN_PROVINCES[number]
