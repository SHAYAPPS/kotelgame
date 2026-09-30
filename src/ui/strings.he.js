// All player-facing text (Hebrew, RTL). Keep UI strings here, not in logic code.

export const HE = {
  gameTitle: 'משחק הכותל',
  buildLabel: 'אב־טיפוס · שלב 1: תנועה',
  start: 'לחצו כדי להתחיל',
  resume: 'לחצו כדי להמשיך',
  paused: 'המשחק מושהה',
  lockError: 'לא הצלחנו לנעול את העכבר. חכו רגע ולחצו שוב.',
  controlsTitle: 'שליטה',
  controls: [
    { keys: ['W', 'A', 'S', 'D'], label: 'תנועה' },
    { keys: ['עכבר'], label: 'הסתכלות' },
    { keys: ['רווח'], label: 'קפיצה' },
    { keys: ['Shift'], label: 'ריצה (להחזיק)' },
    { keys: ['C'], label: 'התכופפות (הפעלה / ביטול)' },
    { keys: ['Esc'], label: 'השהיה' },
    { keys: ['`'], label: 'נתוני ביצועים' },
  ],
  sensitivity: 'רגישות עכבר',
  hud: {
    fps: 'FPS',
    speed: 'מהירות',
    metersPerSecond: 'מ׳/ש׳',
    height: 'גובה',
    meters: 'מ׳',
    grounded: 'על הקרקע',
    airborne: 'באוויר',
    standing: 'עמידה',
    crouching: 'התכופפות',
    sprinting: 'ריצה',
    drawCalls: 'קריאות ציור',
  },
};
