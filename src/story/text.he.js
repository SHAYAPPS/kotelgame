// All mission text: speakers, dialogue, objectives, hints and cards (Hebrew, RTL).
// Rewrite the story here; the mission script (mission1.js) only refers to these ids.
// Placeholder dialogue: to be rewritten.

export const SPEAKERS = {
  cmd: { name: 'סמ״ר אלון', color: '#e2cf9c' }, // squad commander
  yonatan: { name: 'יונתן', color: '#9fd0a8' },
  noam: { name: 'נועם', color: '#9fc2ff' },
  radio: { name: 'קשר', color: '#ffb36b', radio: true },
  control: { name: 'מוקד', color: '#ffb36b', radio: true },
  post3: { name: 'תצפית 3', color: '#ffb36b', radio: true },
  guide: { name: 'מדריכת טיולים', color: '#d8c7f0' },
  civilian: { name: 'אזרח', color: '#d9d9d9' },
  civilianWoman: { name: 'אזרחית', color: '#d9d9d9' },
};

export const LINES = {
  // Arrival
  cmd_call: { speaker: 'cmd', text: 'היי, אתה! בוא אלינו, ליד הבידוק.' },

  // Briefing
  brief_1: { speaker: 'cmd', text: 'בוקר טוב. יום שישי רגיל: הרבה מתפללים, קבוצות תיירים, קצת עומס.' },
  brief_2: { speaker: 'cmd', text: 'אנחנו משמרת סיור. עוברים בבידוק, ברחבה, בקיר ובטרסות העליונות. שגרה.' },
  brief_3: { speaker: 'yonatan', text: 'שגרה זה טוב. הבטחתי לאמא שאגיע לארוחת שישי.' },
  brief_4: { speaker: 'cmd', text: 'אז בוא נסיים אותה בזמן. הנשק מאובטח ומונמך כל המשמרת, ברור?' },
  brief_5: { speaker: 'noam', text: 'ברור, המפקד.' },

  // Tutorial beats
  hint_sprint_line: { speaker: 'cmd', text: 'קדימה, תראה לי שאתה עוד זוכר איך רצים.' },
  hint_crouch_line: { speaker: 'cmd', text: 'טוב. עכשיו להתכופף, כמו שלמדנו מאחורי מחסה.' },
  hint_mag_line: { speaker: 'cmd', text: 'ולפני שיוצאים: בדיקת מחסנית. תמיד.' },
  mag_done: { speaker: 'cmd', text: 'מצוין. יוצאים לסיור, תישאר איתנו.' },

  // Patrol to the wall
  patrol1_a: { speaker: 'noam', text: 'תראו כמה אנשים היום. חצי ירושלים פה.' },
  patrol1_b: { speaker: 'yonatan', text: 'וכל קבוצת תיירים עוצרת בדיוק באמצע הדרך.' },
  patrol1_c: { speaker: 'cmd', text: 'עיניים על הקהל, לא על הטלפון, יונתן.' },
  wall_1: { speaker: 'cmd', text: 'זה הקיר. אבנים מתקופת הורדוס, הגדולות למטה.' },
  wall_2: { speaker: 'noam', text: 'כל פעם שאני פה, זה תופס אותי מחדש.' },
  wall_3: { speaker: 'cmd', text: 'עכשיו לטרסות העליונות. משם רואים את כל הרחבה.' },

  // Patrol to the terraces
  patrol2_a: { speaker: 'yonatan', text: 'המפקד, מתי ההחלפה?' },
  patrol2_b: { speaker: 'cmd', text: 'בשתיים. עוד שעתיים של שקט, אם יהיה לנו מזל.' },
  guide_1: { speaker: 'guide', text: 'ועכשיו, חברים, תסתכלו על הקשת הגדולה משמאל: קשת וילסון.' },

  // Radio chatter (tension)
  radio_1: { speaker: 'post3', text: 'מוקד, כאן תצפית 3. יש תנועה חריגה באזור שער האשפות. לא מאומת.' },
  radio_2: { speaker: 'control', text: 'תצפית 3, מוקד. קיבלתי. תמשיכו לעקוב ותדווחו.' },
  radio_3: { speaker: 'cmd', text: 'שמעתם? להישאר ערניים.' },
  radio_4: { speaker: 'control', text: 'לכל התחנות: דיווחים לא מאומתים על התקהלויות בכמה נקודות בעיר העתיקה.' },
  radio_5: { speaker: 'noam', text: 'זה נשמע לכם רגיל?' },
  radio_6: { speaker: 'post3', text: 'מוקד, תצפית 3... אני רואה אותם עכשיו. הם רצים לכיוון—' },
  radio_7: { speaker: 'radio', text: '(רעש סטטי)' },
  radio_8: { speaker: 'cmd', text: 'כולם אליי. עכשיו.' },

  // ---- Part 2 ----
  // Sirens. Lines with `radio: true` are spoken over the radio (filtered, squelch).
  siren_1: { speaker: 'noam', text: 'זה... צבע אדום?' },
  siren_2: { speaker: 'cmd', text: 'אזעקה! כולם לתפוס מחסה!' },
  siren_3: { speaker: 'control', text: 'לכל הכוחות ברובע: שיגורים לעבר ירושלים. היכונו לאירוע רב־זירתי.' },
  ready_1: { speaker: 'cmd', text: 'נשק דרוך! מחסנית בפנים, כדור בקנה. מעכשיו זה לא תרגיל.' },
  ready_2: { speaker: 'yonatan', text: 'דרוך!' },
  ready_3: { speaker: 'noam', text: 'דרוך!' },

  // Shelter
  shelter_1: { speaker: 'cmd', text: 'מוציאים את האזרחים מהרחבה. כולם אל האולם המקורה מתחת לקשת וילסון!' },
  shelter_2: { speaker: 'cmd', text: 'יש אנשים שקפאו במקום. תגיע אליהם ותזיז אותם, אתה יודע מה לעשות.' },
  shelter_3: { speaker: 'yonatan', text: 'אני מכוון אותם מהטרסה, לכו לכיוון הקשת! מהר!' },
  shelter_4: { speaker: 'noam', text: 'המפקד, קבוצת התיירים רצה לכיוון הלא נכון!' },
  shelter_5: { speaker: 'cmd', text: 'תחזיר אותם. אל תעצרו, להמשיך לזוז!' },
  shelter_late: { speaker: 'control', text: 'לכל התחנות: דיווחים על חמושים בכניסות לעיר העתיקה. היכונו.', radio: true },
  civ_thanks_1: { speaker: 'civilian', text: 'כן, כן, אני הולך!' },
  civ_thanks_2: { speaker: 'civilianWoman', text: 'תודה... לאן? לקשת? בסדר!' },
  civ_thanks_3: { speaker: 'civilian', text: 'אלוהים ישמור. רץ!' },
  civ_thanks_4: { speaker: 'civilianWoman', text: 'הילדים שלי... טוב, אני הולכת!' },

  // First contact
  contact_1: { speaker: 'post3', text: 'מוקד, תצפית 3! חמושים בכניסה הדרומית, יורים!', radio: true },
  contact_2: { speaker: 'cmd', text: 'מגע! כולם למחסה! להחזיק את הרחבה!' },
  contact_south: { speaker: 'noam', text: 'מגע, כניסה דרומית! ליד הבידוק!', radio: true },
  contact_west: { speaker: 'yonatan', text: 'מגע, מדרגות מערביות! עוד חוליה מלמעלה!', radio: true },
  contact_watch: { speaker: 'cmd', text: 'תשמור על שני הכיוונים! דרום ומערב!', radio: true },
  down_1: { speaker: 'yonatan', text: 'נטרלתי אחד!', radio: true },
  down_2: { speaker: 'noam', text: 'מחבל ירד!', radio: true },
  down_3: { speaker: 'cmd', text: 'פגיעה! להמשיך לירות!', radio: true },
  down_player_1: { speaker: 'cmd', text: 'יפה! ירד!', radio: true },
  down_player_2: { speaker: 'noam', text: 'פגיעה טובה!', radio: true },
  last_one: { speaker: 'cmd', text: 'נשאר אחד! לא לתת לו לברוח!', radio: true },

  // After the wave
  after_1: { speaker: 'cmd', text: 'חדל! חדל! מישהו פגוע? תנו לי מצב.' },
  after_2: { speaker: 'yonatan', text: 'אני בסדר. שריטה, לא יותר.' },
  after_3: { speaker: 'noam', text: 'בסדר גמור. האזרחים באולם, אף אחד לא נפגע.' },
  after_4: { speaker: 'cmd', text: 'מוקד, כאן כיתת הסיור. הדפנו חוליה ראשונה ברחבת הכותל. אין נפגעים.', radio: true },
  after_5: { speaker: 'control', text: 'קיבלתי. תגבורת בדרך, לפחות עשרים דקות. אתם חייבים להחזיק את הרחבה.', radio: true },
  after_6: { speaker: 'cmd', text: 'שמעתם. הם יחזרו, ויותר. מחליפים מחסניות ותופסים עמדות. אנחנו מחזיקים את הכותל.' },

  // ---- Part 3: holding the plaza ----
  def_1: { speaker: 'cmd', text: 'הקו שלנו: החומה הנמוכה בין הרחבה לאזור התפילה. מאחורינו, מתחת לקשת וילסון, כל האזרחים.' },
  def_2: { speaker: 'cmd', text: 'אף אחד לא עובר את החומה הזאת. יונתן צפון, נועם דרום, אתה איתי באמצע.' },
  def_3: { speaker: 'yonatan', text: 'הבאתי ארגז תחמושת מעמדת המשטרה. מחסניות ורימונים, תתפנקו.' },
  def_4: { speaker: 'noam', text: 'רק תזכרו: הם מגיעים מלמעלה, מהמדרגות המערביות, וגם מהכניסה הדרומית.' },
  prep_1: { speaker: 'cmd', text: 'קחו רימונים. שלושה לכל אחד, לא יותר.' },
  prep_2: { speaker: 'cmd', text: 'ואל תתקבעו במקום אחד. מי שנשאר באותה נקודה, יחטוף רימון.' },
  prep_3: { speaker: 'post3', text: 'כיתת הכותל, כאן תצפית 3. יש תנועה על גג מעל המדרגות המערביות. היכונו.', radio: true },

  wave1_a: { speaker: 'post3', text: 'חמושים יורדים במדרגות המערביות! חמישה, אולי יותר!', radio: true },
  wave1_b: { speaker: 'cmd', text: 'מגע מערב! להחזיק את הקו!' },
  w1_contact: { speaker: 'yonatan', text: 'מגע, מדרגות מערביות! רובאים!', radio: true },
  b1_1: { speaker: 'cmd', text: 'חדל! להחליף מחסניות. מי שחסר לו, לארגז.' },
  b1_2: { speaker: 'noam', text: 'זה היה רק הגל הראשון, נכון?' },
  b1_3: { speaker: 'control', text: 'כיתת הכותל, מוקד. אנחנו רואים שתי קבוצות מתארגנות: מערב ודרום.', radio: true },

  wave2_a: { speaker: 'post3', text: 'שתי חוליות! אחת במדרגות, אחת בכניסה הדרומית, יחד!', radio: true },
  wave2_b: { speaker: 'cmd', text: 'שני כיוונים! נועם, תחזיק את הדרום!' },
  w2_stairs: { speaker: 'yonatan', text: 'מגע, מדרגות! הם יורים אש חיפוי, תשארו נמוכים!', radio: true },
  w2_flank: { speaker: 'yonatan', text: 'הם מאגפים לאורך הקצה הצפוני של הרחבה!', radio: true },
  w2_south: { speaker: 'noam', text: 'מגע, דרום! אחד מהם זז לאורך החפירות, מאגף!', radio: true },
  over_1: { speaker: 'noam', text: 'הם מעל החומה בצד הצפוני! הקו נפרץ!', radio: true },
  over_2: { speaker: 'cmd', text: 'נסיגה! לעמדה השנייה ליד הכותל, מול הקשת! זזים, זזים!' },
  p2_1: { speaker: 'cmd', text: 'זאת העמדה האחרונה. מאחורינו הקשת והאזרחים. מכאן לא זזים.' },
  p2_2: { speaker: 'yonatan', text: 'עוד ארגז פה, ליד הקיר. תמלאו.' },
  p2_3: { speaker: 'post3', text: 'כיתת הכותל... הם מביאים הכול. כולל צלף על הטרסות העליונות.', radio: true },

  wave3_a: { speaker: 'control', text: 'לכל התחנות: מתקפה גדולה על רחבת הכותל, מכל הכיוונים!', radio: true },
  wave3_b: { speaker: 'cmd', text: 'הנה הם באים! כל מה שיש לכם!' },
  w3_sniper: { speaker: 'yonatan', text: 'צלף על הטרסות העליונות! תחפשו את הנצנוץ של הכוונת!', radio: true },
  w3_stairs: { speaker: 'noam', text: 'מגע, מדרגות! הרבה!', radio: true },
  w3_rush: { speaker: 'noam', text: 'הם רצים עלינו מהדרום! להסתער אלינו!', radio: true },
  grenade_1: { speaker: 'yonatan', text: 'רימון!' },
  grenade_2: { speaker: 'noam', text: 'רימון! תתרחקו!' },
  grenade_3: { speaker: 'cmd', text: 'רימון! לזוז!' },

  lull_1: { speaker: 'cmd', text: 'חדל... הם נסוגים. תנו לי מצב.' },
  lull_2: { speaker: 'yonatan', text: 'אני בסדר. כמעט בלי תחמושת.' },
  lull_3: { speaker: 'post3', text: 'מוקד, תצפית 3. הם מתארגנים בשער האשפות. עשרות, ויש רכבים.', radio: true },
  lull_4: { speaker: 'control', text: 'קיבלתי. כיתת הכותל, זה הולך להיות גדול יותר. תגבורת עדיין בדרך.', radio: true },
  lull_5: { speaker: 'noam', text: 'יותר גדול מזה?' },
  lull_6: { speaker: 'cmd', text: 'למלא מחסניות, לשתות מים. כשהם יחזרו, אנחנו כאן.' },

  // ---- Part 4: the final push, the counterattack, the ending ----
  final_1: { speaker: 'post3', text: 'הם יוצאים! מכל הכיוונים: מדרגות, דרום, צפון, גגות!', radio: true },
  final_2: { speaker: 'cmd', text: 'זה זה. המתקפה האחרונה שלהם. אף אחד לא עובר!' },
  truck_1: { speaker: 'noam', text: 'רכב! טנדר עם מקלע פרץ בכניסה הדרומית!', radio: true },
  truck_2: { speaker: 'yonatan', text: 'הוא מרתק אותנו! אני לא יכול להרים את הראש!', radio: true },
  truck_3: { speaker: 'cmd', text: 'רובים לא יעשו לו כלום! קח את המטול מארגז התחמושת, עכשיו!' },
  truck_4: { speaker: 'cmd', text: 'יש לך מטול. תכוון לטנדר ותוריד אותו!' },
  truck_hit: { speaker: 'noam', text: 'הוא עוד זז! עוד טיל!', radio: true },
  truck_down_1: { speaker: 'cmd', text: 'הטנדר מושמד! פגיעה מושלמת!' },
  truck_down_2: { speaker: 'yonatan', text: 'הם נסוגים! הם בורחים לבידוק ולמדרגות!', radio: true },

  counter_1: { speaker: 'cmd', text: 'מעכשיו אנחנו תוקפים. לוקחים את הרחבה בחזרה!' },
  counter_2: { speaker: 'cmd', text: 'מתקדמים בדילוגים: חוליה אחת מחפה, השנייה זזה. יעד ראשון: הבידוק הדרומי.' },
  move_1: { speaker: 'yonatan', text: 'זז!', radio: true },
  move_2: { speaker: 'noam', text: 'מתקדם!', radio: true },
  cover_1: { speaker: 'cmd', text: 'מחפה!', radio: true },
  cover_2: { speaker: 'yonatan', text: 'מחפה, לך!', radio: true },
  cp_1: { speaker: 'cmd', text: 'הבידוק נקי! הבידוק הדרומי בידינו!' },
  cp_2: { speaker: 'noam', text: 'יש עוד חוליה על המדרגות המערביות, הם יורים מלמעלה.' },
  cp_3: { speaker: 'cmd', text: 'אז עולים אליהם. יעד שני: המדרגות המערביות.' },
  stairs_done: { speaker: 'yonatan', text: 'המדרגות נקיות! אין יותר תנועה!' },

  end_1: { speaker: 'control', text: 'כיתת הכותל, כאן מוקד. כוחות תגבורת נכנסים לעיר העתיקה מכל השערים.', radio: true },
  end_2: { speaker: 'control', text: 'המחבלים שנותרו נמלטים. אתם יכולים להוריד את הראש. עבודה טובה.', radio: true },
  end_3: { speaker: 'cmd', text: 'שמעתם. חדל אש. נאסף ליד הכותל.' },
  end_4: { speaker: 'noam', text: 'תראו... האזרחים יוצאים מהקשת.' },
  end_5: { speaker: 'guide', text: 'הם החזיקו. הם באמת החזיקו.' },
  end_6: { speaker: 'yonatan', text: 'אמא שלי לא תאמין לסיפור הזה בארוחת שישי.' },
  end_7: { speaker: 'cmd', text: 'היום שמרנו על המקום הזה, ועל האנשים שבו. זה מה שאנחנו. עכשיו, הביתה.' },
};

export const OBJECTIVES = {
  report: 'דווח למפקד הכיתה',
  follow_cmd: 'הישאר עם המפקד',
  patrol_wall: 'סיור עם הכיתה: אזור התפילה ליד הכותל',
  patrol_terraces: 'סיור עם הכיתה: הטרסות העליונות',
  wait_orders: 'הישאר עם הכיתה',
  take_cover: 'הישאר עם המפקד',
  shelter: 'הבא את האזרחים למחסה מתחת לקשת וילסון',
  eliminate: 'חסל את המחבלים',
  regroup: 'התארגנו מחדש עם הכיתה',
  take_position: 'תפוס עמדה בחומה הנמוכה מול הרחבה',
  hold_line: 'החזק את הקו: אל תתן להם להגיע לאזרחים',
  fall_back: 'היסוג לעמדה השנייה ליד הכותל',
  hold_line2: 'החזק את העמדה השנייה',
  final_hold: 'עצור את המתקפה האחרונה',
  get_launcher: 'קח את המטול מארגז התחמושת',
  destroy_truck: 'השמד את הטנדר עם המקלע',
  secure_checkpoint: 'כבוש את הבידוק הדרומי',
  secure_stairs: 'כבוש את המדרגות המערביות',
  regroup_wall: 'היאסף עם הכיתה ליד הכותל',
};

// Counter shown under the objective (a number follows).
export const COUNTERS = {
  civilians: 'אזרחים שנותרו בחוץ',
  enemies: 'מחבלים שנותרו',
};

// Hints show a key and a text; keys stay LTR.
export const HINTS = {
  move: { keys: ['W', 'A', 'S', 'D'], text: 'תנועה, והעכבר להסתכלות' },
  talk: { keys: ['E'], text: 'שיחה' },
  sprint: { keys: ['Shift'], text: 'החזק לריצה' },
  crouch: { keys: ['C'], text: 'התכופפות' },
  mag: { keys: ['R'], text: 'בדיקת מחסנית (הנשק מונמך במשמרת)' },
  shelter: { keys: ['E'], text: 'ליד אזרח שקפא: שלח אותו למחסה' },
  fire: { keys: ['LMB', 'RMB'], text: 'ירי / כוונת' },
  grenade: { keys: ['G'], text: 'רימון: החזק לכיוון, שחרר לזריקה' },
  switch: { keys: ['1', '2'], text: 'החלפת נשק (או גלגלת העכבר). כוונת עם המקש הימני.' },
};

export const CARDS = {
  intro: ['רחבת הכותל המערבי, ירושלים העתיקה', 'יום שישי · 11:40', 'משמרת סיור'],
  part1End: ['סוף חלק 1', 'המשך יבוא'],
  part3End: ['להחזיק את הכותל', 'המשך יבוא'],
  mission2Soon: ['משימה 2', 'בקרוב'],
};

// Mission UI text.
export const STORY_UI = {
  objectivePrefix: 'משימה',
  meters: 'מ׳',
  talkPrompt: 'שיחה עם',
  shelterPrompt: 'שלח למחסה',
  cratePrompt: 'ארגז תחמושת: מלא מחסניות ורימונים',
  crateLauncherPrompt: 'ארגז תחמושת: קח את המטול',
  missionComplete: 'המשימה הושלמה',
  missionName: 'משימה 1: הכותל',
  stats: { time: 'זמן', accuracy: 'דיוק', headshots: 'פגיעות ראש', kills: 'מחבלים שנוטרלו' },
  weaponRifle: 'רובה סער',
  weaponLauncher: 'מטול',
  resupplied: 'תחמושת ורימונים מולאו',
  lowAmmo: 'תחמושת נמוכה: לך לארגז התחמושת',
  failedTitle: 'המשימה נכשלה',
  failedCivilian: 'פגעת באזרח.',
  failedTeammate: 'פגעת בחבר צוות.',
  retry: 'חוזרים לנקודת השמירה האחרונה…',
  checkpoint: 'נקודת שמירה',
  devMenuTitle: 'כלי פיתוח: קפיצה לשלב במשימה',
  devWeapon: 'נשק דרוך (לבדיקה)',
  devClose: 'סגירה (F2)',
};
