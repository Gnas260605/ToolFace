import { Aspect, EditPlan, RESOLUTIONS } from './plan';
import { Timeline } from './timeline';

export interface CaptionCue {
  start: number;
  end: number;
  text: string;
}

const WORDS_PER_CUE: Record<Aspect, number> = { '9:16': 5, '1:1': 6, '16:9': 8 };

/**
 * Break a scene's narration into short cues and spread them over the time the voice speaks,
 * proportionally to their character length (a good proxy for speaking time).
 */
export function cuesForText(
  text: string,
  start: number,
  duration: number,
  wordsPerCue: number,
): CaptionCue[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0 || duration <= 0) return [];

  const groups: string[] = [];
  let current: string[] = [];
  for (const w of words) {
    current.push(w);
    // Break early after punctuation so cues follow the phrasing.
    if (
      current.length >= wordsPerCue ||
      (/[.,!?;:…]$/.test(w) && current.length >= Math.ceil(wordsPerCue / 2))
    ) {
      groups.push(current.join(' '));
      current = [];
    }
  }
  if (current.length) groups.push(current.join(' '));

  const weights = groups.map((g) => g.length + 3);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const cues: CaptionCue[] = [];
  let t = start;
  groups.forEach((g, i) => {
    const d = (duration * weights[i]) / totalWeight;
    cues.push({ start: t, end: t + d, text: g });
    t += d;
  });
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
}

/** Build a complete .ass subtitle file (captions + optional hook headline). */
export function buildAss(plan: EditPlan, timeline: Timeline, opts: CaptionOptions): string {
  const { width: W, height: H } = RESOLUTIONS[opts.aspect];
  const c = plan.captions;
  const sizeFactor: Record<Aspect, number> = { '9:16': 0.075, '1:1': 0.065, '16:9': 0.055 };
  const base = Math.min(W, H) * sizeFactor[opts.aspect] * c.scale;
  const fontSize = Math.round(base);
  const hookSize = Math.round(base * 1.25);
  const outline = Math.max(3, Math.round(fontSize / 14));
  const marginLR = Math.round(W * 0.08);

  const alignment = c.position === 'top' ? 8 : c.position === 'center' ? 5 : 2;
  // Keep bottom captions above TikTok/Reels UI on vertical video.
  const marginV =
    c.position === 'bottom'
      ? Math.round(H * (opts.aspect === '9:16' ? 0.17 : 0.08))
      : Math.round(H * 0.1);

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,${opts.fontName},${fontSize},${assColor(c.color)},${assColor(c.highlightColor)},&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,${outline},2,${alignment},${marginLR},${marginLR},${marginV},1
Style: Hook,${opts.fontName},${hookSize},${assColor(c.highlightColor)},${assColor(c.color)},&H00000000,&H50000000,-1,0,0,0,100,100,0,0,3,${Math.round(hookSize / 5)},0,8,${marginLR},${marginLR},${Math.round(H * 0.1)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const lines: string[] = [];
  const upper = (s: string) => (c.uppercase ? s.toLocaleUpperCase('vi') : s);

  if (plan.hookText?.trim()) {
    const end = Math.min(2.8, timeline.scenes[0].duration);
    lines.push(
      `Dialogue: 1,${assTime(0.1)},${assTime(end)},Hook,,0,0,0,,{\\fad(150,250)}${escapeAss(upper(plan.hookText.trim()))}`,
    );
  }

  if (c.enabled) {
    timeline.scenes.forEach((ts) => {
      const scene = plan.scenes[ts.index];
      const text = scene.caption?.trim() || scene.narration;
      // Without narration audio, show the caption across the scene.
      const start = ts.audioDuration > 0 ? ts.audioStart : ts.start + 0.2;
      const dur = ts.audioDuration > 0 ? ts.audioDuration : Math.max(0, ts.duration - 0.4);
      for (const cue of cuesForText(text, start, dur, WORDS_PER_CUE[opts.aspect])) {
        lines.push(
          `Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},Caption,,0,0,0,,{\\fad(60,60)}${escapeAss(upper(cue.text))}`,
        );
      }
    });
  }

  return header + lines.join('\n') + '\n';
}
