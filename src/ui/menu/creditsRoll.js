// The credits screen's roll, built from public/assets/CREDITS.md (pure: text in, data out).
// Each "## Section" becomes a heading; its tables become entries (the work, its author, the
// license), the Mixamo tables a line each; Creative Commons notices are kept word for word.

const HEADINGS = {
  'surface textures': 'טקסטורות',
  'sky / image-based lighting': 'שמיים ותאורה',
  'characters and animations': 'דמויות ואנימציות',
  'weapons and vehicles': 'נשק וכלי רכב',
  'sounds and music': 'צלילים ומוזיקה',
  'other files': 'רכיבים נוספים',
};

/** Markdown inline text -> plain: links to their text, no code spans, emphasis or escapes. */
export function plain(md) {
  return md
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`[^`]*`/g, '')
    .replace(/\*\*|__|\*/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:)])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .trim();
}

function cells(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

/**
 * @returns {{ title: string, tables: { headers: string[], rows: string[][] }[], paragraphs: string[] }[]}
 */
export function parseCredits(md) {
  const sections = [];
  let sec = null;
  let table = null;
  let para = [];
  const flush = () => {
    if (sec && para.length) sec.paragraphs.push(para.join(' '));
    para = [];
  };
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('## ')) {
      flush();
      table = null;
      sec = { title: line.slice(3).trim(), tables: [], paragraphs: [] };
      sections.push(sec);
      continue;
    }
    if (!sec) continue; // the intro before the first section is for developers
    if (line.startsWith('|')) {
      flush();
      const c = cells(line);
      if (c.every((x) => /^:?-{3,}:?$/.test(x))) continue; // the header separator
      if (!table) {
        table = { headers: c, rows: [] };
        sec.tables.push(table);
      } else table.rows.push(c);
      continue;
    }
    table = null;
    if (!line) flush();
    else para.push(line);
  }
  flush();
  return sections;
}

/** "Title by Author" (after plain()) -> { title, by }. */
function splitBy(text) {
  const i = text.lastIndexOf(' by ');
  if (i < 0) return { title: text, by: '' };
  return { title: text.slice(0, i).trim(), by: text.slice(i + 4).trim() };
}

/**
 * The roll: per section a heading and its entries ({ title, by, license }), plus the notices
 * that must appear as written (CC-BY attributions).
 * @returns {{ heading: string, entries: { title: string, by: string, license: string }[], notices: string[] }[]}
 */
export function buildRoll(sections) {
  const out = [];
  for (const s of sections) {
    const name = s.title.replace(/\s*\(.*\)\s*$/, '').trim();
    const heading = HEADINGS[name.toLowerCase()] ?? name;
    const entries = [];
    const seen = new Set();
    const add = (e) => {
      const key = `${e.title}|${e.by}|${e.license}`;
      if (seen.has(key) || !e.title) return;
      seen.add(key);
      entries.push(e);
    };
    for (const t of s.tables) {
      const h = t.headers.map((x) => x.toLowerCase());
      const src = h.indexOf('source');
      const lic = h.indexOf('license');
      const character = h.indexOf('mixamo character');
      const anim = h.indexOf('mixamo animation');
      if (character >= 0) {
        add({ title: 'Mixamo (Adobe)', by: t.rows.map((r) => plain(r[character] ?? '')).filter(Boolean).join(', '), license: 'Mixamo' });
      } else if (anim >= 0) {
        add({ title: 'Mixamo (Adobe)', by: `${t.rows.length} animations`, license: 'Mixamo' });
      } else if (src >= 0) {
        for (const r of t.rows) {
          const raw = r[src] ?? '';
          // Long descriptions: the first sentence.
          const text = plain(raw).replace(/\s+by$/, '').split(/(?<=\.)\s/)[0].replace(/\.$/, '');
          // The first column names the thing, unless it's a file name or pattern.
          const work = plain(r[0].replace(/`([^`]*)`/g, '$1')).replace(/\s*\(.*$/, '');
          const named = work && !/[_*/]|\.\w{2,4}$/.test(work);
          const license = lic >= 0 ? plain(r[lic] ?? '') : '';
          // A linked work: "Title by Author".
          if (raw.includes('](') && text.includes(' by ')) add({ ...splitBy(text), license });
          else if (named) add({ title: work, by: text, license });
          else add({ title: text.split(',')[0], by: '', license });
        }
      }
    }
    const notices = s.paragraphs.filter((p) => /creative commons/i.test(p)).map(plain);
    if (entries.length || notices.length) out.push({ heading, entries, notices });
  }
  return out;
}
