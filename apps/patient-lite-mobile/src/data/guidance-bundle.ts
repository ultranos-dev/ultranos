/**
 * Public Health Guidance Bundle — Patient-Lite Mobile
 *
 * Story 53.7 — AC: 3, 8
 *
 * Bundles physician-authored guidance content for offline use in Patient-Lite.
 * Patient-Lite cannot import from lab-lite directly; this file mirrors the seed
 * data for offline-capable display.
 *
 * AC: 8 — The distribution payload carries only guidance IDs. Patient-Lite
 * looks up the full content locally from this bundle. No network call required.
 *
 * IMPORTANT: All content here is physician-authored. NOT AI-generated.
 * Content must match the lab-lite seed data (apps/lab-lite/src/lib/guidance-seed-data.ts).
 * When updating clinical content, update both files together and bump the version.
 *
 * No PHI — this file contains static clinical guidance text only.
 */

import type { GuidanceContentBundle } from '@/types/guidance'

// ---------------------------------------------------------------------------
// Bundled guidance content — indexed by ID for O(1) lookup
// ---------------------------------------------------------------------------

const GUIDANCE_BUNDLE_LIST: GuidanceContentBundle[] = [
  {
    id: 'PHG-MALARIA-001',
    conditionCode: 'MALARIA_POSITIVE',
    conditionDisplay: 'guidance.conditions.malariaPositive',
    text: {
      en: 'Your malaria test is positive. Your doctor will give you medicine. Take all the medicine every day until it is finished.',
      ar: '[TRANSLATE] نتيجة اختبار الملاريا إيجابية. سيعطيك الطبيب الدواء. تناول جميع الأدوية كل يوم حتى تنتهي.',
      prs: '[TRANSLATE] نتیجه آزمایش ملاریای شما مثبت است. پزشک شما دارو می‌دهد. همه داروها را هر روز بگیرید تا تمام شود.',
      ps: '[TRANSLATE] ستاسو د ملاریا ازموینه مثبته ده. ستاسو ډاکټر به درته درمل درکوي. هره ورځ ټول درملونه واخلئ تر هغه چې پای ته ورسیږي.',
    },
    audio: { en: '', ar: '', prs: '', ps: '' },
    steps: [
      { order: 1, icon: 'medicine', text: { en: 'Take ALL your medicine every day until finished — even when you feel better.', ar: '[TRANSLATE] تناول جميع دوائك كل يوم حتى تنتهي - حتى عندما تشعر بتحسن.', prs: '[TRANSLATE] همه داروها را هر روز بگیرید تا تمام شود — حتی وقتی بهتر احساس می‌کنید.', ps: '[TRANSLATE] هره ورځ ټول درملونه واخلئ تر هغه چې پای ته ورسیږي — حتی کله چې ښه احساس وکړئ.' } },
      { order: 2, icon: 'bed', text: { en: 'Sleep under a bed net tonight — this stops mosquitoes from biting others in your home.', ar: '[TRANSLATE] نم تحت ناموسية الليلة — هذا يمنع البعوض من لدغ الآخرين في منزلك.', prs: '[TRANSLATE] امشب زیر پشه‌بند بخوابید — این از نیش زدن پشه به دیگران در خانه جلوگیری می‌کند.', ps: '[TRANSLATE] نن شپه د چینجیو جال لاندې ویده شئ — دا د ستاسو کور کې نورو ته د چینجیو د چیچلو مخه نیسي.' } },
      { order: 3, icon: 'family', text: { en: 'Bring your children for testing within 2 days — malaria can spread within the family.', ar: '[TRANSLATE] أحضر أطفالك للاختبار في غضون يومين — يمكن أن تنتشر الملاريا داخل الأسرة.', prs: '[TRANSLATE] کودکان خود را ظرف ۲ روز برای آزمایش بیاورید — ملاریا می‌تواند در خانواده گسترش یابد.', ps: '[TRANSLATE] خپل ماشومان د ۲ ورځو دننه د ازموینې لپاره راوړئ — ملاریا کولای شي د کورنۍ دننه خپره شي.' } },
      { order: 4, icon: 'water', text: { en: 'Drink clean water and rest — this helps your body fight the infection.', ar: '[TRANSLATE] اشرب ماءً نظيفاً وارتاح — هذا يساعد جسمك على محاربة العدوى.', prs: '[TRANSLATE] آب پاک بنوشید و استراحت کنید — این به بدن شما کمک می‌کند تا با عفونت مبارزه کند.', ps: '[TRANSLATE] پاک اوبه وڅښئ او آرام واخلئ — دا ستاسو بدن ته د انتان سره د مبارزې کې مرسته کوي.' } },
    ],
    author: { name: 'Dr. Nadia Osmani', credentials: 'MD, Infectious Disease', institution: 'French Medical Institute for Mothers and Children (FMIC), Kabul' },
    version: '1.0.0',
    lastReviewedAt: '2026-05-01',
    approvedBy: 'WHO Afghanistan Country Office, Public Health Working Group',
  },
  {
    id: 'PHG-TB-001',
    conditionCode: 'TB_POSITIVE',
    conditionDisplay: 'guidance.conditions.tbPositive',
    text: {
      en: 'Your tuberculosis (TB) test is positive. TB is treatable. You must take medicine every day for several months to be cured.',
      ar: '[TRANSLATE] نتيجة اختبار السل (TB) إيجابية. السل قابل للعلاج. يجب أن تتناول الدواء كل يوم لعدة أشهر للشفاء.',
      prs: '[TRANSLATE] نتیجه آزمایش سل (TB) شما مثبت است. سل قابل درمان است. برای بهبودی باید چند ماه هر روز دارو بگیرید.',
      ps: '[TRANSLATE] ستاسو د تپنده رنځ (TB) ازموینه مثبته ده. تپنده رنځ درملیز دی. د جوړیدو لپاره باید ډیری میاشتې هره ورځ درمل واخلئ.',
    },
    audio: { en: '', ar: '', prs: '', ps: '' },
    steps: [
      { order: 1, icon: 'medicine', text: { en: 'Take ALL your medicine every day — even when you feel better. Stopping early makes TB harder to treat.', ar: '[TRANSLATE] تناول جميع دوائك كل يوم — حتى عندما تشعر بتحسن. التوقف المبكر يجعل علاج السل أصعب.', prs: '[TRANSLATE] همه داروها را هر روز بگیرید — حتی وقتی بهتر احساس می‌کنید. توقف زودهنگام درمان سل را سخت‌تر می‌کند.', ps: '[TRANSLATE] هره ورځ ټول درملونه واخلئ — حتی کله چې ښه احساس وکړئ. وخت پخوا ودرول د تپنده رنځ درملنه ستونزمنه کوي.' } },
      { order: 2, icon: 'mask', text: { en: 'Cover your mouth when coughing or sneezing — use a cloth or elbow, not your hands.', ar: '[TRANSLATE] غطِّ فمك عند السعال أو العطس — استخدم قماشاً أو كوعك، وليس يديك.', prs: '[TRANSLATE] هنگام سرفه یا عطسه دهان خود را بپوشانید — از پارچه یا آرنج استفاده کنید، نه دستانتان.', ps: '[TRANSLATE] کله چې کاسه کوئ یا چتیاری وکړئ خوله یې وپوښئ — د لاس پرځای د جامو یا د مرستۍ تر لاسه وکار واخلئ.' } },
      { order: 3, icon: 'air', text: { en: 'Open windows for fresh air — good ventilation helps stop TB from spreading in your home.', ar: '[TRANSLATE] افتح النوافذ للهواء النقي — يساعد التهوية الجيدة على منع انتشار السل في منزلك.', prs: '[TRANSLATE] پنجره‌ها را برای هوای تازه باز کنید — تهویه مناسب از گسترش سل در خانه جلوگیری می‌کند.', ps: '[TRANSLATE] د تازه هوا لپاره کړکۍ خلاص کړئ — ښه هواکي د ستاسو کور دننه د تپنده رنځ خپریدو مخنیوی کوي.' } },
      { order: 4, icon: 'family', text: { en: 'Bring family members who live with you for testing — they may need preventive treatment.', ar: '[TRANSLATE] أحضر أفراد الأسرة الذين يعيشون معك للاختبار — قد يحتاجون إلى علاج وقائي.', prs: '[TRANSLATE] اعضای خانواده‌ای که با شما زندگی می‌کنند را برای آزمایش بیاورید — ممکن است به درمان پیشگیرانه نیاز داشته باشند.', ps: '[TRANSLATE] د کورنۍ هغه غړي چې له تاسو سره ژوند کوي د ازموینې لپاره راوړئ — ممکن دوی ته د مخنیوي درملنې ته اړتیا وي.' } },
      { order: 5, icon: 'calendar', text: { en: 'Return for your follow-up appointment — your doctor will check if the medicine is working.', ar: '[TRANSLATE] عد لموعد المتابعة — سيتحقق طبيبك مما إذا كان الدواء يعمل.', prs: '[TRANSLATE] برای قرار ملاقات پیگیری برگردید — پزشک شما بررسی می‌کند که آیا دارو مؤثر است.', ps: '[TRANSLATE] د تعقیبي ملاقات لپاره راستون شئ — ستاسو ډاکټر به وګوري چې ایا درمل کار کوي.' } },
    ],
    author: { name: 'Dr. Ahmad Wali Noori', credentials: 'MD, Public Health, TB Specialist', institution: 'National Tuberculosis Control Programme, Ministry of Public Health, Afghanistan' },
    version: '1.0.0',
    lastReviewedAt: '2026-05-01',
    approvedBy: 'WHO Afghanistan Country Office, Public Health Working Group',
  },
  {
    id: 'PHG-HEPB-001',
    conditionCode: 'HEPATITIS_B_POSITIVE',
    conditionDisplay: 'guidance.conditions.hepatitisBPositive',
    text: {
      en: 'Your hepatitis B surface antigen test is positive. This means you have hepatitis B. Your doctor will explain your treatment plan.',
      ar: '[TRANSLATE] نتيجة اختبار مستضد سطح التهاب الكبد B إيجابية. هذا يعني أن لديك التهاب الكبد B. سيشرح لك طبيبك خطة علاجك.',
      prs: '[TRANSLATE] آزمایش آنتی‌ژن سطح هپاتیت B شما مثبت است. این بدان معناست که هپاتیت B دارید. پزشک شما برنامه درمانی را توضیح خواهد داد.',
      ps: '[TRANSLATE] ستاسو د هپاتایتس B د سطحي انتي جن ازموینه مثبته ده. دا پدې مانا ده چې تاسو هپاتایتس B لرئ. ستاسو ډاکټر به ستاسو د درملنې پلان توضیح کړي.',
    },
    audio: { en: '', ar: '', prs: '', ps: '' },
    steps: [
      { order: 1, icon: 'doctor', text: { en: 'Your doctor will explain your treatment plan — hepatitis B can be managed with medicine.', ar: '[TRANSLATE] سيشرح لك طبيبك خطة علاجك — يمكن إدارة التهاب الكبد B بالدواء.', prs: '[TRANSLATE] پزشک شما برنامه درمانی را توضیح خواهد داد — هپاتیت B می‌تواند با دارو کنترل شود.', ps: '[TRANSLATE] ستاسو ډاکټر به ستاسو د درملنې پلان توضیح کړي — هپاتایتس B د درمل سره اداره کیدای شي.' } },
      { order: 2, icon: 'noShare', text: { en: 'Do not share razors, toothbrushes, or needles — hepatitis B spreads through blood.', ar: '[TRANSLATE] لا تشارك أدوات الحلاقة أو فرش الأسنان أو الإبر — ينتشر التهاب الكبد B عن طريق الدم.', prs: '[TRANSLATE] تیغ، مسواک، یا سرنگ را به اشتراک نگذارید — هپاتیت B از طریق خون منتقل می‌شود.', ps: '[TRANSLATE] ریش تراش، د غاښو برش، یا سرنج شریک نه کړئ — هپاتایتس B د وینې له لارې خپریږي.' } },
      { order: 3, icon: 'family', text: { en: 'Your close family should be tested and vaccinated — the vaccine is effective and free.', ar: '[TRANSLATE] يجب اختبار أسرتك المقربة وتطعيمها — اللقاح فعّال ومجاني.', prs: '[TRANSLATE] خانواده نزدیک شما باید آزمایش شده و واکسینه شوند — واکسن مؤثر و رایگان است.', ps: '[TRANSLATE] ستاسو نږدې کورنۍ باید ازموینه وشي او واکسین ورکړل شي — واکسین مؤثر او وړیا دی.' } },
      { order: 4, icon: 'noAlcohol', text: { en: 'Avoid alcohol — alcohol damages the liver and makes hepatitis B worse.', ar: '[TRANSLATE] تجنب الكحول — الكحول يضر الكبد ويفاقم التهاب الكبد B.', prs: '[TRANSLATE] از الکل پرهیز کنید — الکل به کبد آسیب می‌زند و هپاتیت B را بدتر می‌کند.', ps: '[TRANSLATE] د شرابو مخه ونیسئ — شراب ځیګر ته زیان رسوي او هپاتایتس B بدوي.' } },
      { order: 5, icon: 'calendar', text: { en: 'Return for follow-up blood tests — your doctor will monitor your liver health.', ar: '[TRANSLATE] عد لاختبارات الدم المتابعة — سيراقب طبيبك صحة كبدك.', prs: '[TRANSLATE] برای آزمایش‌های خون پیگیری برگردید — پزشک شما سلامت کبدتان را رصد خواهد کرد.', ps: '[TRANSLATE] د تعقیبي وینې ازموینو لپاره راستون شئ — ستاسو ډاکټر به ستاسو د ځیګر روغتیا وڅاري.' } },
    ],
    author: { name: 'Dr. Nadia Osmani', credentials: 'MD, Infectious Disease', institution: 'French Medical Institute for Mothers and Children (FMIC), Kabul' },
    version: '1.0.0',
    lastReviewedAt: '2026-05-01',
    approvedBy: 'WHO Afghanistan Country Office, Public Health Working Group',
  },
  {
    id: 'PHG-HEPC-001',
    conditionCode: 'HEPATITIS_C_POSITIVE',
    conditionDisplay: 'guidance.conditions.hepatitisCPositive',
    text: {
      en: 'Your hepatitis C antibody test is positive. Hepatitis C can be cured with medicine. Your doctor will explain the treatment.',
      ar: '[TRANSLATE] نتيجة اختبار أجسام التهاب الكبد C المضادة إيجابية. يمكن علاج التهاب الكبد C بالدواء. سيشرح لك طبيبك العلاج.',
      prs: '[TRANSLATE] آزمایش آنتی‌بادی هپاتیت C شما مثبت است. هپاتیت C با دارو قابل درمان است. پزشک شما درمان را توضیح خواهد داد.',
      ps: '[TRANSLATE] ستاسو د هپاتایتس C د اینتي باډي ازموینه مثبته ده. هپاتایتس C د درمل سره درملیز دی. ستاسو ډاکټر به درملنه توضیح کړي.',
    },
    audio: { en: '', ar: '', prs: '', ps: '' },
    steps: [
      { order: 1, icon: 'medicine', text: { en: 'Hepatitis C can be cured — modern medicines cure most people in 8–12 weeks.', ar: '[TRANSLATE] يمكن علاج التهاب الكبد C — تعالج الأدوية الحديثة معظم الأشخاص في 8-12 أسبوعاً.', prs: '[TRANSLATE] هپاتیت C قابل درمان است — داروهای مدرن اکثر افراد را در ۸ تا ۱۲ هفته درمان می‌کنند.', ps: '[TRANSLATE] هپاتایتس C درملیز دی — عصري درملونه ډیری خلک د ۸–۱۲ اونۍ دننه جوړوي.' } },
      { order: 2, icon: 'doctor', text: { en: 'Your doctor will explain the treatment plan and when to start.', ar: '[TRANSLATE] سيشرح لك طبيبك خطة العلاج ومتى تبدأ.', prs: '[TRANSLATE] پزشک شما برنامه درمانی و زمان شروع را توضیح خواهد داد.', ps: '[TRANSLATE] ستاسو ډاکټر به د درملنې پلان او د پیل وخت توضیح کړي.' } },
      { order: 3, icon: 'noShare', text: { en: 'Do not share razors, toothbrushes, or needles — hepatitis C spreads through blood.', ar: '[TRANSLATE] لا تشارك أدوات الحلاقة أو فرش الأسنان أو الإبر — ينتشر التهاب الكبد C عن طريق الدم.', prs: '[TRANSLATE] تیغ، مسواک، یا سرنگ را به اشتراک نگذارید — هپاتیت C از طریق خون منتقل می‌شود.', ps: '[TRANSLATE] ریش تراش، د غاښو برش، یا سرنج شریک نه کړئ — هپاتایتس C د وینې له لارې خپریږي.' } },
      { order: 4, icon: 'family', text: { en: 'Your close family should be tested — they may have been exposed and may need treatment.', ar: '[TRANSLATE] يجب اختبار أسرتك المقربة — قد يكونون قد تعرضوا للعدوى وقد يحتاجون إلى علاج.', prs: '[TRANSLATE] خانواده نزدیک شما باید آزمایش شوند — ممکن است در معرض قرار گرفته باشند و به درمان نیاز داشته باشند.', ps: '[TRANSLATE] ستاسو نږدې کورنۍ باید ازموینه وشي — ممکن دوی افشا شوي وي او درملنې ته اړتیا ولري.' } },
      { order: 5, icon: 'noAlcohol', text: { en: 'Avoid alcohol — alcohol damages the liver and reduces the effectiveness of treatment.', ar: '[TRANSLATE] تجنب الكحول — الكحول يضر الكبد ويقلل من فعالية العلاج.', prs: '[TRANSLATE] از الکل پرهیز کنید — الکل به کبد آسیب می‌زند و اثربخشی درمان را کاهش می‌دهد.', ps: '[TRANSLATE] د شرابو مخه ونیسئ — شراب ځیګر ته زیان رسوي او د درملنې اغیزمنتیا کموي.' } },
    ],
    author: { name: 'Dr. Nadia Osmani', credentials: 'MD, Infectious Disease', institution: 'French Medical Institute for Mothers and Children (FMIC), Kabul' },
    version: '1.0.0',
    lastReviewedAt: '2026-05-01',
    approvedBy: 'WHO Afghanistan Country Office, Public Health Working Group',
  },
  {
    id: 'PHG-HIV-001',
    conditionCode: 'HIV_POSITIVE',
    conditionDisplay: 'guidance.conditions.hivPositive',
    text: {
      en: 'Your HIV rapid test is positive. This result is confidential. Effective medicines are available. Your doctor will explain your options.',
      ar: '[TRANSLATE] نتيجة اختبار HIV السريع إيجابية. هذه النتيجة سرية. تتوفر أدوية فعالة. سيشرح لك طبيبك خياراتك.',
      prs: '[TRANSLATE] آزمایش سریع HIV شما مثبت است. این نتیجه محرمانه است. داروهای مؤثر در دسترس هستند. پزشک شما گزینه‌های شما را توضیح خواهد داد.',
      ps: '[TRANSLATE] ستاسو د HIV ګړندۍ ازموینه مثبته ده. دا پایله محرمه ده. مؤثر درملونه شتون لري. ستاسو ډاکټر به ستاسو انتخابونه توضیح کړي.',
    },
    audio: { en: '', ar: '', prs: '', ps: '' },
    steps: [
      { order: 1, icon: 'confidential', text: { en: 'This result is confidential — your privacy is protected. Only your care team will know.', ar: '[TRANSLATE] هذه النتيجة سرية — خصوصيتك محمية. فريق رعايتك فقط سيعلم.', prs: '[TRANSLATE] این نتیجه محرمانه است — حریم خصوصی شما محافظت می‌شود. فقط تیم مراقبت شما خواهد دانست.', ps: '[TRANSLATE] دا پایله محرمه ده — ستاسو محرمیت خوندي دی. یوازې ستاسو د پاملرنې ټیم پوهیږي.' } },
      { order: 2, icon: 'medicine', text: { en: 'Effective medicines (antiretrovirals) are available — people on treatment live long, healthy lives.', ar: '[TRANSLATE] الأدوية الفعالة (مضادات الفيروسات القهقرية) متاحة — الأشخاص الذين يتلقون العلاج يعيشون حياة طويلة وصحية.', prs: '[TRANSLATE] داروهای مؤثر (داروهای ضد ویروسی) در دسترس هستند — افرادی که تحت درمان هستند زندگی طولانی و سالم دارند.', ps: '[TRANSLATE] مؤثر درملونه (انتي ریتروویرال) شتون لري — د درملنې خلک اوږد او روغتیایي ژوند کوي.' } },
      { order: 3, icon: 'doctor', text: { en: 'Return for your next appointment — your doctor will explain treatment and confirmatory testing.', ar: '[TRANSLATE] عد لموعدك القادم — سيشرح لك طبيبك العلاج والاختبار التأكيدي.', prs: '[TRANSLATE] برای قرار ملاقات بعدی خود برگردید — پزشک شما درمان و آزمایش تأییدی را توضیح خواهد داد.', ps: '[TRANSLATE] د خپل راتلونکي ملاقات لپاره راستون شئ — ستاسو ډاکټر به درملنه او تاییدي ازموینه توضیح کړي.' } },
      { order: 4, icon: 'counselor', text: { en: 'A counselor is available to talk with you — you do not have to face this alone.', ar: '[TRANSLATE] يتوفر مستشار للتحدث معك — لا يجب أن تواجه هذا وحدك.', prs: '[TRANSLATE] یک مشاور برای صحبت با شما در دسترس است — نباید با این موضوع تنها روبرو شوید.', ps: '[TRANSLATE] یو مشاور د تاسو سره د خبرو لپاره شتون لري — تاسو باید دا یوازې مخ نه کړئ.' } },
    ],
    author: { name: 'Dr. Ahmad Wali Noori', credentials: 'MD, Public Health, HIV/AIDS Program', institution: 'National AIDS Control Programme, Ministry of Public Health, Afghanistan' },
    version: '1.0.0',
    lastReviewedAt: '2026-05-01',
    approvedBy: 'WHO Afghanistan Country Office, Public Health Working Group',
  },
  {
    id: 'PHG-ANEMIA-SEVERE-001',
    conditionCode: 'ANEMIA_SEVERE',
    conditionDisplay: 'guidance.conditions.anemiaSevere',
    text: {
      en: 'Your blood count shows your hemoglobin is very low. This is called severe anemia. Your doctor will decide on the best treatment.',
      ar: '[TRANSLATE] يُظهر تعداد الدم أن الهيموغلوبين لديك منخفض جداً. يسمى هذا فقر الدم الشديد. سيقرر طبيبك العلاج الأفضل.',
      prs: '[TRANSLATE] شمارش خون نشان می‌دهد هموگلوبین شما بسیار پایین است. این کم‌خونی شدید نامیده می‌شود. پزشک شما بهترین درمان را تصمیم خواهد گرفت.',
      ps: '[TRANSLATE] ستاسو د وینې شمیر ښیي چې ستاسو هیموګلوبین خورا ټیټ دی. دا د وینې سخت کموالی بلل کیږي. ستاسو ډاکټر به غوره درملنه پریکړه کړي.',
    },
    audio: { en: '', ar: '', prs: '', ps: '' },
    steps: [
      { order: 1, icon: 'doctor', text: { en: 'Your doctor may give you iron medicine or a blood transfusion — follow their advice.', ar: '[TRANSLATE] قد يعطيك طبيبك دواء حديد أو نقل دم — اتبع نصيحته.', prs: '[TRANSLATE] پزشک شما ممکن است داروی آهن یا انتقال خون بدهد — توصیه‌های آن‌ها را دنبال کنید.', ps: '[TRANSLATE] ستاسو ډاکټر ممکن تاسو ته د اوسپنې درمل یا د وینې انتقال درکړي — د دوی مشوره تعقیب کړئ.' } },
      { order: 2, icon: 'food', text: { en: 'Eat iron-rich foods: red meat, chicken, fish, lentils, beans, spinach, and dark leafy greens.', ar: '[TRANSLATE] تناول الأطعمة الغنية بالحديد: اللحم الأحمر والدجاج والسمك والعدس والفول والسبانخ والخضروات الورقية الداكنة.', prs: '[TRANSLATE] غذاهای سرشار از آهن بخورید: گوشت قرمز، مرغ، ماهی، عدس، لوبیا، اسفناج و سبزیجات برگ تیره.', ps: '[TRANSLATE] د اوسپنې د لوړ مقدار خواړه وخورئ: سره غوښه، مرغۍ، کب، مسر، لوبیا، پالک، او تیاره شنه پاڼه لرونکي سبزیجات.' } },
      { order: 3, icon: 'rest', text: { en: 'Rest and avoid heavy physical work until your hemoglobin improves.', ar: '[TRANSLATE] ارتاح وتجنب العمل البدني الشاق حتى يتحسن الهيموغلوبين لديك.', prs: '[TRANSLATE] استراحت کنید و از کار سنگین فیزیکی پرهیز کنید تا هموگلوبین شما بهبود یابد.', ps: '[TRANSLATE] آرام واخلئ او تر هغه چې ستاسو هیموګلوبین ښه نشي سنګین فزیکي کار مه کوئ.' } },
      { order: 4, icon: 'calendar', text: { en: 'Return for follow-up blood tests — your doctor needs to check your hemoglobin is rising.', ar: '[TRANSLATE] عد لاختبارات الدم المتابعة — يحتاج طبيبك إلى التحقق من ارتفاع الهيموغلوبين لديك.', prs: '[TRANSLATE] برای آزمایش‌های خون پیگیری برگردید — پزشک شما باید بررسی کند که هموگلوبین در حال افزایش است.', ps: '[TRANSLATE] د تعقیبي وینې ازموینو لپاره راستون شئ — ستاسو ډاکټر ته اړتیا ده چې وګوري ستاسو هیموګلوبین لوړیږي.' } },
    ],
    author: { name: 'Dr. Nasrin Rahimi', credentials: 'MD, Hematopathologist', institution: 'Kabul University Medical Centre' },
    version: '1.0.0',
    lastReviewedAt: '2026-05-01',
    approvedBy: 'WHO Afghanistan Country Office, Public Health Working Group',
  },
]

export const GUIDANCE_BUNDLE: Map<string, GuidanceContentBundle> = new Map(
  GUIDANCE_BUNDLE_LIST.map((g) => [g.id, g]),
)

/**
 * Look up a guidance content bundle by its ID.
 * Returns undefined if the ID is not found in the bundle.
 */
export function getGuidanceById(id: string): GuidanceContentBundle | undefined {
  return GUIDANCE_BUNDLE.get(id)
}
