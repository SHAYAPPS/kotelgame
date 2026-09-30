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
};

export const CARDS = {
  intro: ['רחבת הכותל המערבי, ירושלים העתיקה', 'יום שישי · 11:40', 'משמרת סיור'],
  part1End: ['סוף חלק 1', 'המשך יבוא'],
  part2End: ['להחזיק את הכותל', 'המשך יבוא'],
};

// Mission UI text.
export const STORY_UI = {
  objectivePrefix: 'משימה',
  meters: 'מ׳',
  talkPrompt: 'שיחה עם',
  shelterPrompt: 'שלח למחסה',
  failedTitle: 'המשימה נכשלה',
  failedCivilian: 'פגעת באזרח.',
  failedTeammate: 'פגעת בחבר צוות.',
  retry: 'חוזרים לנקודת השמירה האחרונה…',
  checkpoint: 'נקודת שמירה',
  devMenuTitle: 'כלי פיתוח: קפיצה לשלב במשימה',
  devWeapon: 'נשק דרוך (לבדיקה)',
  devClose: 'סגירה (F2)',
};
