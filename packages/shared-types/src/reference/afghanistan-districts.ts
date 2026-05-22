import type { AfghanProvince } from './afghanistan-geo.js'

export interface AfghanDistrict {
  /** English canonical name (ALA-LC romanized) */
  name: string
  /** Dari/Pashto script name */
  nameLocal: string
  /** Parent province */
  province: AfghanProvince
}

// WARNING: LINGUISTIC REVIEW REQUIRED — District names and local script forms
// must be reviewed by a native Dari/Pashto speaker before production.
// Source: Afghanistan Central Statistics Organization (CSO) district list.
// This dataset includes representative districts per province.
// Full dataset (~400 entries) needs completion from authoritative CSO source.
export const AFGHAN_DISTRICTS: readonly AfghanDistrict[] = [
  // Badakhshan Province (4 districts)
  { name: 'Faizabad', nameLocal: 'فیض آباد', province: 'Badakhshan' },
  { name: 'Jurm', nameLocal: 'جرم', province: 'Badakhshan' },
  { name: 'Baharak', nameLocal: 'بهارک', province: 'Badakhshan' },
  { name: 'Kishim', nameLocal: 'کشم', province: 'Badakhshan' },

  // Badghis Province (3 districts)
  { name: 'Qala-i-Naw', nameLocal: 'قلعه نو', province: 'Badghis' },
  { name: 'Muqur', nameLocal: 'مقر', province: 'Badghis' },
  { name: 'Ghormach', nameLocal: 'غورماچ', province: 'Badghis' },

  // Baghlan Province (3 districts)
  { name: 'Pul-i-Khumri', nameLocal: 'پل خمری', province: 'Baghlan' },
  { name: 'Baghlan', nameLocal: 'بغلان', province: 'Baghlan' },
  { name: 'Nahrin', nameLocal: 'نهرین', province: 'Baghlan' },

  // Balkh Province (6 districts)
  { name: 'Mazar-i-Sharif', nameLocal: 'مزار شریف', province: 'Balkh' },
  { name: 'Nahr-i-Shahi', nameLocal: 'نهر شاهی', province: 'Balkh' },
  { name: 'Dehdadi', nameLocal: 'دهدادی', province: 'Balkh' },
  { name: 'Balkh', nameLocal: 'بلخ', province: 'Balkh' },
  { name: 'Char Bolak', nameLocal: 'چار بولک', province: 'Balkh' },
  { name: 'Khulm', nameLocal: 'خلم', province: 'Balkh' },

  // Bamyan Province (3 districts)
  { name: 'Bamyan City', nameLocal: 'شهر بامیان', province: 'Bamyan' },
  { name: 'Bamyan', nameLocal: 'بامیان', province: 'Bamyan' },
  { name: 'Yakawlang', nameLocal: 'یکه ولنگ', province: 'Bamyan' },

  // Daykundi Province (3 districts)
  { name: 'Nili', nameLocal: 'نیلی', province: 'Daykundi' },
  { name: 'Shahristan', nameLocal: 'شهرستان', province: 'Daykundi' },
  { name: 'Kiti', nameLocal: 'کیتی', province: 'Daykundi' },

  // Farah Province (3 districts)
  { name: 'Farah City', nameLocal: 'شهر فراه', province: 'Farah' },
  { name: 'Farah', nameLocal: 'فراه', province: 'Farah' },
  { name: 'Bala Buluk', nameLocal: 'بالابلوک', province: 'Farah' },

  // Faryab Province (3 districts)
  { name: 'Maimana', nameLocal: 'میمنه', province: 'Faryab' },
  { name: 'Andkhoy', nameLocal: 'اندخوی', province: 'Faryab' },
  { name: 'Qaisar', nameLocal: 'قیصار', province: 'Faryab' },

  // Ghazni Province (3 districts)
  { name: 'Ghazni', nameLocal: 'غزنی', province: 'Ghazni' },
  { name: 'Qarabagh', nameLocal: 'قره باغ', province: 'Ghazni' },
  { name: 'Jaghori', nameLocal: 'جاغوری', province: 'Ghazni' },

  // Ghor Province (3 districts)
  { name: 'Chaghcharan', nameLocal: 'چغچران', province: 'Ghor' },
  { name: 'Shahrak', nameLocal: 'شهرک', province: 'Ghor' },
  { name: 'Tulak', nameLocal: 'تولک', province: 'Ghor' },

  // Helmand Province (3 districts)
  { name: 'Lashkar Gah', nameLocal: 'لشکر گاه', province: 'Helmand' },
  { name: 'Nad Ali', nameLocal: 'ناد علی', province: 'Helmand' },
  { name: 'Sangin', nameLocal: 'سنگین', province: 'Helmand' },

  // Herat Province (6 districts)
  { name: 'Herat', nameLocal: 'هرات', province: 'Herat' },
  { name: 'Injil', nameLocal: 'انجیل', province: 'Herat' },
  { name: 'Guzara', nameLocal: 'گذره', province: 'Herat' },
  { name: 'Pashtun Zarghun', nameLocal: 'پشتون زرغون', province: 'Herat' },
  { name: 'Karokh', nameLocal: 'کرخ', province: 'Herat' },
  { name: 'Obeh', nameLocal: 'اوبه', province: 'Herat' },

  // Jawzjan Province (3 districts)
  { name: 'Shiberghan', nameLocal: 'شبرغان', province: 'Jawzjan' },
  { name: 'Aqcha', nameLocal: 'آقچه', province: 'Jawzjan' },
  { name: 'Fayzabad', nameLocal: 'فیض آباد', province: 'Jawzjan' },

  // Kabul Province (7 districts)
  { name: 'Kabul', nameLocal: 'کابل', province: 'Kabul' },
  { name: 'Paghman', nameLocal: 'پغمان', province: 'Kabul' },
  { name: 'Chahar Asyab', nameLocal: 'چهار آسیاب', province: 'Kabul' },
  { name: 'Bagrami', nameLocal: 'بگرامی', province: 'Kabul' },
  { name: 'Deh Sabz', nameLocal: 'ده سبز', province: 'Kabul' },
  { name: 'Shakardara', nameLocal: 'شکردره', province: 'Kabul' },
  { name: 'Musahi', nameLocal: 'موسهی', province: 'Kabul' },

  // Kandahar Province (6 districts)
  { name: 'Kandahar', nameLocal: 'کندهار', province: 'Kandahar' },
  { name: 'Dand', nameLocal: 'دند', province: 'Kandahar' },
  { name: 'Arghandab', nameLocal: 'ارغنداب', province: 'Kandahar' },
  { name: 'Panjwai', nameLocal: 'پنجوایی', province: 'Kandahar' },
  { name: 'Zhari', nameLocal: 'ژری', province: 'Kandahar' },
  { name: 'Spin Boldak', nameLocal: 'سپین بولدک', province: 'Kandahar' },

  // Kapisa Province (3 districts)
  { name: 'Mahmud Raqi', nameLocal: 'محمود راقی', province: 'Kapisa' },
  { name: 'Nijrab', nameLocal: 'نجراب', province: 'Kapisa' },
  { name: 'Tagab', nameLocal: 'تگاب', province: 'Kapisa' },

  // Khost Province (3 districts)
  { name: 'Matun', nameLocal: 'متون', province: 'Khost' },
  { name: 'Khost', nameLocal: 'خوست', province: 'Khost' },
  { name: 'Mandozai', nameLocal: 'منډوزی', province: 'Khost' },

  // Kunar Province (3 districts)
  { name: 'Asadabad', nameLocal: 'اسعد آباد', province: 'Kunar' },
  { name: 'Narang', nameLocal: 'نرنگ', province: 'Kunar' },
  { name: 'Sarkani', nameLocal: 'سرکانی', province: 'Kunar' },

  // Kunduz Province (3 districts)
  { name: 'Kunduz', nameLocal: 'کندز', province: 'Kunduz' },
  { name: 'Imam Sahib', nameLocal: 'امام صاحب', province: 'Kunduz' },
  { name: 'Aliabad', nameLocal: 'علی آباد', province: 'Kunduz' },

  // Laghman Province (3 districts)
  { name: 'Mehtarlam', nameLocal: 'مهتر لام', province: 'Laghman' },
  { name: 'Qarghayi', nameLocal: 'قرغه یی', province: 'Laghman' },
  { name: 'Alingar', nameLocal: 'علینگار', province: 'Laghman' },

  // Logar Province (3 districts)
  { name: 'Pul-i-Alam', nameLocal: 'پل علم', province: 'Logar' },
  { name: 'Mohammad Agha', nameLocal: 'محمد آغه', province: 'Logar' },
  { name: 'Baraki Barak', nameLocal: 'برکی برک', province: 'Logar' },

  // Nangarhar Province (6 districts)
  { name: 'Jalalabad', nameLocal: 'جلال آباد', province: 'Nangarhar' },
  { name: 'Behsud', nameLocal: 'بهسود', province: 'Nangarhar' },
  { name: 'Surkhrod', nameLocal: 'سرخرود', province: 'Nangarhar' },
  { name: 'Rodat', nameLocal: 'رودات', province: 'Nangarhar' },
  { name: 'Kuz Kunar', nameLocal: 'کوز کنر', province: 'Nangarhar' },
  { name: 'Achin', nameLocal: 'اچین', province: 'Nangarhar' },

  // Nimroz Province (3 districts)
  { name: 'Zaranj', nameLocal: 'زرنج', province: 'Nimroz' },
  { name: 'Kang', nameLocal: 'کنگ', province: 'Nimroz' },
  { name: 'Charburjak', nameLocal: 'چهاربرجک', province: 'Nimroz' },

  // Nuristan Province (3 districts)
  { name: 'Parun', nameLocal: 'پارون', province: 'Nuristan' },
  { name: 'Kamdesh', nameLocal: 'کامدیش', province: 'Nuristan' },
  { name: 'Wama', nameLocal: 'وامه', province: 'Nuristan' },

  // Paktia Province (3 districts)
  { name: 'Gardez', nameLocal: 'گردیز', province: 'Paktia' },
  { name: 'Ahmad Aba', nameLocal: 'احمد آباد', province: 'Paktia' },
  { name: 'Zurmat', nameLocal: 'زرمت', province: 'Paktia' },

  // Paktika Province (3 districts)
  { name: 'Sharana', nameLocal: 'شرنه', province: 'Paktika' },
  { name: 'Urgun', nameLocal: 'ارگون', province: 'Paktika' },
  { name: 'Barmal', nameLocal: 'برمل', province: 'Paktika' },

  // Panjshir Province (3 districts)
  { name: 'Bazarak', nameLocal: 'بازارک', province: 'Panjshir' },
  { name: 'Rukha', nameLocal: 'رخه', province: 'Panjshir' },
  { name: 'Shotul', nameLocal: 'شتل', province: 'Panjshir' },

  // Parwan Province (3 districts)
  { name: 'Charikar', nameLocal: 'چاریکار', province: 'Parwan' },
  { name: 'Bagram', nameLocal: 'بگرام', province: 'Parwan' },
  { name: 'Jabal Saraj', nameLocal: 'جبل سراج', province: 'Parwan' },

  // Samangan Province (3 districts)
  { name: 'Aibak', nameLocal: 'ایبک', province: 'Samangan' },
  { name: 'Hazrat Sultan', nameLocal: 'حضرت سلطان', province: 'Samangan' },
  { name: 'Dara-i-Suf Bala', nameLocal: 'دره صوف بالا', province: 'Samangan' },

  // Sar-e-Pol Province (3 districts)
  { name: 'Sar-e-Pol', nameLocal: 'سرپل', province: 'Sar-e-Pol' },
  { name: 'Sangcharak', nameLocal: 'سنگچارک', province: 'Sar-e-Pol' },
  { name: 'Gosfandi', nameLocal: 'گوسفندی', province: 'Sar-e-Pol' },

  // Takhar Province (3 districts)
  { name: 'Taloqan', nameLocal: 'تالقان', province: 'Takhar' },
  { name: 'Rustaq', nameLocal: 'رستاق', province: 'Takhar' },
  { name: 'Khwaja Ghar', nameLocal: 'خواجه غار', province: 'Takhar' },

  // Urozgan Province (3 districts)
  { name: 'Tarin Kowt', nameLocal: 'ترین کوت', province: 'Urozgan' },
  { name: 'Chora', nameLocal: 'چوره', province: 'Urozgan' },
  { name: 'Dehrawud', nameLocal: 'دهراود', province: 'Urozgan' },

  // Wardak Province (3 districts)
  { name: 'Maidan Shahr', nameLocal: 'میدان شهر', province: 'Wardak' },
  { name: 'Nirkh', nameLocal: 'نرخ', province: 'Wardak' },
  { name: 'Jalrez', nameLocal: 'جلریز', province: 'Wardak' },

  // Zabul Province (3 districts)
  { name: 'Qalat', nameLocal: 'قلات', province: 'Zabul' },
  { name: 'Shahjoy', nameLocal: 'شاهجوی', province: 'Zabul' },
  { name: 'Mizan', nameLocal: 'میزان', province: 'Zabul' },
] as const

/**
 * Returns all districts belonging to the specified province.
 * Returns empty array if province has no districts in the dataset.
 */
export function getDistrictsByProvince(province: AfghanProvince): AfghanDistrict[] {
  return AFGHAN_DISTRICTS.filter(d => d.province === province)
}
