// Who voices whom: each speaker of src/story/text.he.js (a radio variant goes with its speaker)
// -> the ElevenLabs voice its lines were generated with (Eleven v4) and a pitch shift in
// semitones that `npm run assets:voices` applies with the formants, so one library voice can
// play another person: lower sounds older / bigger, higher younger (children: an adult
// woman's voice shifted up). The library has four Hebrew men's voices; the parts that may
// have an accent (an American grandfather, a British collector, an American yeshiva student,
// the tourists) use English voices speaking Hebrew. Read by voices.mjs and credits.mjs.

/** Speakers that share a voice with another speaker. */
export const ROLE_OF = { cmdRadio: 'cmd', noamRadio: 'noam', meRadio: 'me', radio: 'control' };

export const CAST = {
  cmd: { part: 'Sgt. Alon, the commander', voice: 'Omer - Confident, Upbeat Ad' },
  yonatan: { part: 'Yonatan', voice: 'Itai - Upbeat Social Creator' },
  noam: { part: 'Noam', voice: 'Tomer - Calm, Curious Narrator' },
  control: { part: 'Control (radio)', voice: 'Dana - Patient Support Agent' },
  post3: { part: 'Lookout 3 (radio)', voice: 'Yael - Gentle, Confident Ad' },
  me: { part: 'The player', voice: 'Amit - Calm, Curious Narrator' },
  guard: { part: 'Shimon, the guard', voice: 'Tomer - Calm, Curious Narrator', pitch: -2.5 },
  guide: { part: 'The tour guide', voice: 'Noa - Warm, Patient Narrator' },
  visitor: { part: 'Visitors', voice: 'Omer - Confident, Upbeat Ad', pitch: -2.5 },
  visitorF: { part: 'Visitors (women)', voice: 'Shira - Cheerful Social Creator' },
  man: { part: 'Worshipers', voice: 'Itai - Upbeat Social Creator', pitch: -3 },
  woman: { part: 'Worshipers (women)', voice: 'Tamar - Gentle, Confident Ad' },
  dad: { part: 'A father', voice: 'Amit - Calm, Curious Narrator', pitch: -2.5 },
  mom: { part: 'A mother', voice: 'Michal - Patient Support Agent' },
  elder: { part: 'A grandfather', voice: 'Bill - Wise, Mature, Balanced' },
  grandma: { part: 'A grandmother', voice: 'Dana - Patient Support Agent', pitch: -3 },
  kid: { part: 'A boy', voice: 'Maya - Cheerful, Friendly Creator', pitch: 4 },
  kidGirl: { part: 'A girl', voice: 'Shira - Cheerful Social Creator', pitch: 5 },
  teen: { part: 'A teenager', voice: 'Itai - Upbeat Social Creator', pitch: 2.5 },
  tourist: { part: 'A tourist', voice: 'Chris - Charming, Down-to-Earth' },
  touristWoman: { part: 'A tourist (woman)', voice: 'Jessica - Playful, Bright, Warm' },
  yeshiva: { part: 'A yeshiva student', voice: 'Liam - Energetic, Social Media Creator' },
  usher: { part: 'An usher', voice: 'Amit - Calm, Curious Narrator', pitch: 2 },
  collector: { part: 'A charity collector', voice: 'George - Warm, Captivating Storyteller' },
  soldierVisitor: { part: 'A soldier visiting', voice: 'Tomer - Calm, Curious Narrator', pitch: 2 },
  police: { part: 'A Border Police officer', voice: 'Omer - Confident, Upbeat Ad', pitch: 2 },
  civilian: { part: 'People fleeing', voice: 'Roger - Laid-Back, Casual, Resonant' },
  civilianWoman: { part: 'People fleeing (women)', voice: 'Maya - Cheerful, Friendly Creator' },
};

/** The voice role of a line's speaker. */
export const roleOf = (speaker) => ROLE_OF[speaker] ?? speaker;
