import { Aspect, EditPlan, RESOLUTIONS } from './plan';
import { Timeline } from './timeline';

/** A word with absolute times on the output timeline (seconds). */
export interface WordTiming {
  text: string;
  start: number;
  end: number;
}

export interface CaptionCue {
  sceneIndex: number;
  start: number;
  end: number;
  words: WordTiming[];
}

const WORDS_PER_CUE: Record<Aspect, number> = { '9:16': 4, '1:1': 5, '16:9': 7 };

/** Lowercase, strip punctuation — for matching TTS words and emphasis words to the script. */
export function normalizeWord(w: string): string {
  return w
    .toLocaleLowerCase('vi')
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/** Spread words over a time window proportionally to their length (fallback when TTS gives no timings). */
export function estimateWordTimings(text: string, start: number, duration: number): WordTiming[] {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || duration <= 0) return [];
  const weights = tokens.map((t) => normalizeWord(t).length + 1.5);
  const total = weights.reduce((a, b) => a + b, 0);
  let t = start;
  return tokens.map((tok, i) => {
    const d = (duration * weights[i]) / total;
    const w = { text: tok, start: t, end: t + d };
    t += d;
    return w;
  });
}

/**
 * Put the script's own words (with punctuation) on the TTS word timings.
 * TTS boundaries drop punctuation and can differ slightly, so match greedily and interpolate gaps.
 * `ttsWords` are relative to `offset`.
 */
export function alignWords(
  text: string,
  ttsWords: { text: string; start: number; end: number }[],
  offset: number,
  fallbackDuration: number,
): WordTiming[] {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  if (ttsWords.length === 0) return estimateWordTimings(text, offset, fallbackDuration);

  const timed: ({ start: number; end: number } | null)[] = tokens.map(() => null);
  let j = 0;
  tokens.forEach((tok, i) => {
    const norm = normalizeWord(tok);
    if (!norm) return;
    for (let k = j; k < Math.min(ttsWords.length, j + 4); k++) {
      const tw = normalizeWord(ttsWords[k].text);
      if (tw === norm || (tw.length > 0 && (tw.startsWith(norm) || norm.startsWith(tw)))) {
        timed[i] = { start: ttsWords[k].start, end: ttsWords[k].end };
        j = k + 1;
        return;
      }
    }
  });

  const matched = timed.filter(Boolean).length;
  if (matched < Math.ceil(tokens.length * 0.5)) {
    const last = ttsWords[ttsWords.length - 1];
    return estimateWordTimings(text, offset + ttsWords[0].start, last.end - ttsWords[0].start);
  }

  // Interpolate unmatched tokens between their matched neighbours.
  const result: WordTiming[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (timed[i]) {
      result.push({
        text: tokens[i],
        start: offset + timed[i]!.start,
        end: offset + timed[i]!.end,
      });
      continue;
    }
    let a = i - 1;
    while (a >= 0 && !timed[a]) a--;
    let b = i + 1;
    while (b < tokens.length && !timed[b]) b++;
    const from =
      a >= 0 ? timed[a]!.end : b < tokens.length ? Math.max(0, timed[b]!.start - 0.3) : 0;
    const to = b < tokens.length ? timed[b]!.start : from + 0.3;
    const gapCount = b - a - 1;
    const pos = i - a - 1;
    const span = Math.max(0.05, to - from);
    const s = from + (span * pos) / gapCount;
    result.push({ text: tokens[i], start: offset + s, end: offset + s + span / gapCount });
  }
  return result;
}

/** Group words into short on-screen lines, breaking after punctuation where it reads naturally. */
export function groupWords(
  words: WordTiming[],
  wordsPerCue: number,
  sceneIndex: number,
): CaptionCue[] {
  const cues: CaptionCue[] = [];
  let current: WordTiming[] = [];
  const flush = () => {
    if (!current.length) return;
    cues.push({
      sceneIndex,
      start: current[0].start,
      end: current[current.length - 1].end,
      words: current,
    });
    current = [];
  };
  for (const w of words) {
    current.push(w);
    const punct = /[.,!?;:…]$/.test(w.text);
    if (current.length >= wordsPerCue || (punct && current.length >= 2)) flush();
  }
  flush();
  // Close small gaps so lines don't flicker off between phrases.
  for (let i = 0; i < cues.length - 1; i++) {
    const gap = cues[i + 1].start - cues[i].end;
    if (gap > 0 && gap < 0.6) cues[i].end = cues[i + 1].start;
  }
  if (cues.length) cues[cues.length - 1].end += 0.2;
  return cues;
}

/**
 * All caption lines for the video.
 * `sceneWords[i]` = word timings from the TTS for scene i, relative to its narration start (optional).
 */
export function buildCaptionCues(
  plan: EditPlan,
  timeline: Timeline,
  aspect: Aspect,
  sceneWords: (WordTiming[] | undefined)[] = [],
): CaptionCue[] {
  if (!plan.captions.enabled) return [];
  const cues: CaptionCue[] = [];
  for (const ts of timeline.scenes) {
    const scene = plan.scenes[ts.index];
    const override = scene.caption?.trim();
    const text = override || scene.narration;
    if (!text.trim()) continue;
    let words: WordTiming[];
    if (override || ts.audioDuration <= 0) {
      // Captions without narration stay up for most of the scene.
      const start = ts.audioDuration > 0 ? ts.audioStart : ts.start + 0.2;
      const dur = ts.audioDuration > 0 ? ts.audioDuration : Math.max(0.5, ts.duration - 0.4);
      words = estimateWordTimings(text, start, dur);
    } else {
      words = alignWords(text, sceneWords[ts.index] ?? [], ts.audioStart, ts.audioDuration);
    }
    // Never let a line run past its scene.
    const sceneEnd = ts.start + ts.duration;
    const sceneCues = groupWords(words, WORDS_PER_CUE[aspect], ts.index);
    for (const c of sceneCues) c.end = Math.min(c.end, sceneEnd);
    cues.push(...sceneCues);
  }
  return cues;
}

/** "#RRGGBB" -> ASS "&HAABBGGRR" */
export function assColor(hex: string, alpha = 0): string {
  const h = hex.replace('#', '');
  const r = h.slice(0, 2);
  const g = h.slice(2, 4);
  const b = h.slice(4, 6);
  const a = alpha.toString(16).padStart(2, '0');
  return `&H${a}${b}${g}${r}`.toUpperCase();
}

export function assTime(t: number): string {
  const cs = Math.max(0, Math.round(t * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

function escapeAss(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/[{}]/g, '').replace(/\r?\n/g, '\\N');
}

export interface CaptionOptions {
  aspect: Aspect;
  fontName: string;
  /** Word timings from the TTS per scene, relative to the narration start. */
  sceneWords?: (WordTiming[] | undefined)[];
}

/** Split a headline into balanced lines with hard breaks (so the pop animation can't re-wrap it). */
export function balanceLines(text: string, maxChars: number): string {
  const words = text.split(' ');
  if (text.length <= maxChars || words.length < 2) return text;
  const lineCount = Math.min(3, Math.ceil(text.length / maxChars));
  const target = text.length / lineCount;
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const next = current ? `${current} ${w}` : w;
    if (current && next.length > target && lines.length < lineCount - 1) {
      lines.push(current);
      current = w;
    } else {
      current = next;
    }
  }
  lines.push(current);
  return lines.join('\\N');
}

/** Pop-in: start small, overshoot, settle. */
const POP_IN = '\\fscx75\\fscy75\\t(0,90,\\fscx110\\fscy110)\\t(90,170,\\fscx100\\fscy100)';
const ACTIVE_SCALE = 112;

/** Build a complete .ass subtitle file (captions + optional hook headline). */
export function buildAss(plan: EditPlan, timeline: Timeline, opts: CaptionOptions): string {
  const { width: W, height: H } = RESOLUTIONS[opts.aspect];
  const c = plan.captions;
  const sizeFactor: Record<Aspect, number> = { '9:16': 0.08, '1:1': 0.07, '16:9': 0.058 };
  const base = Math.min(W, H) * sizeFactor[opts.aspect] * c.scale;
  const fontSize = Math.round(base);
  const hookSize = Math.round(base * 1.2);
  const outline = Math.max(4, Math.round(fontSize / 9));
  const marginLR = Math.round(W * 0.07);
  const hl = assColor(c.highlightColor);

  const alignment = c.position === 'top' ? 8 : c.position === 'center' ? 5 : 2;
  // Keep bottom captions above TikTok/Reels UI on vertical video.
  const marginV =
    c.position === 'bottom'
      ? Math.round(H * (opts.aspect === '9:16' ? 0.18 : 0.08))
      : Math.round(H * 0.1);

  // BorderStyle 1 = thick outline + drop shadow; 3 = opaque box (Outline = padding).
  const captionBorder = c.box ? `3,${Math.round(fontSize / 5)},0` : `1,${outline},4`;
  // Box colour comes from OutlineColour in libass; shadow from BackColour.
  const captionOutline = c.box ? '&H50000000' : '&H00000000';
  const captionBack = c.box ? '&H50000000' : '&H96000000';

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,${opts.fontName},${fontSize},${assColor(c.color)},${hl},${captionOutline},${captionBack},-1,0,0,0,100,100,1,0,${captionBorder},${alignment},${marginLR},${marginLR},${marginV},1
Style: Hook,${opts.fontName},${hookSize},&H00000000,${assColor(c.color)},${hl},&H00000000,-1,0,0,0,100,100,1,0,3,${Math.round(hookSize / 4)},0,8,${marginLR},${marginLR},${Math.round(H * 0.11)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const lines: string[] = [];
  const upper = (s: string) => (c.uppercase ? s.toLocaleUpperCase('vi') : s);

  if (plan.hookText?.trim()) {
    const end = Math.min(2.8, timeline.scenes[0].duration);
    // Black text on a highlight-coloured box: the most eye-catching thing in the frame.
    lines.push(
      `Dialogue: 2,${assTime(0.05)},${assTime(end)},Hook,,0,0,0,,{\\q2${POP_IN}\\fad(0,250)}${balanceLines(escapeAss(upper(plan.hookText.trim())), opts.aspect === '16:9' ? 34 : 18)}`,
    );
  }

  // Spoken word: dark text on a thick highlight-coloured stroke (a "marker" look), slightly bigger,
  // so it never gets confused with emphasis words, which are just coloured.
  // With the box style the stroke is the box, so there the word is coloured instead.
  const activeTag = c.box
    ? `\\c${hl}\\fscx${ACTIVE_SCALE}\\fscy${ACTIVE_SCALE}`
    : `\\c&H00141414&\\3c${hl}\\bord${Math.round(outline * 1.8)}\\shad0\\fscx${ACTIVE_SCALE}\\fscy${ACTIVE_SCALE}`;

  const cues = buildCaptionCues(plan, timeline, opts.aspect, opts.sceneWords);
  for (const cue of cues) {
    // Emphasis entries may be phrases ("rõ nét"): colour each of their words.
    const emphasis = new Set(
      plan.scenes[cue.sceneIndex].emphasis
        .flatMap((e) => e.split(/\s+/))
        .map(normalizeWord)
        .filter(Boolean),
    );
    const isEmph = (w: string) => emphasis.has(normalizeWord(w));

    const render = (activeIndex: number) =>
      cue.words
        .map((w, i) => {
          const txt = escapeAss(upper(w.text));
          if (i === activeIndex) return `{${activeTag}}${txt}{\\r}`;
          if (isEmph(w.text)) return `{\\c${hl}}${txt}{\\r}`;
          return txt;
        })
        .join(' ');

    if (c.style === 'karaoke') {
      // One event per word: the word being spoken lights up and grows a little.
      cue.words.forEach((w, i) => {
        const start = i === 0 ? cue.start : w.start;
        const end = i === cue.words.length - 1 ? cue.end : cue.words[i + 1].start;
        if (end - start < 0.01) return;
        const fx = i === 0 ? `{${POP_IN}}` : '';
        lines.push(
          `Dialogue: 0,${assTime(start)},${assTime(end)},Caption,,0,0,0,,${fx}${render(i)}`,
        );
      });
    } else {
      const fx = c.style === 'pop' ? `{${POP_IN}\\fad(0,80)}` : '{\\fad(80,80)}';
      lines.push(
        `Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},Caption,,0,0,0,,${fx}${render(-1)}`,
      );
    }
  }

  return header + lines.join('\n') + '\n';
}
