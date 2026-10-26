import { spawnSync } from 'node:child_process';
import { mkdtempSync, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  alignWords,
  assColor,
  assTime,
  balanceLines,
  buildAss,
  buildCaptionCues,
  estimateWordTimings,
  groupWords,
} from './captions';
import { buildSfxGraph, planSfx } from './sfx';
import { parseTtsWords } from './tts';
import { CancelledError, CommandTimeoutError, FFMPEG, run, withSignal } from './ffmpeg';
import { CachedTts } from './tts';
import { FileCache } from './cache';
import { DEFAULT_LIMITS, InputValidationError, validateInputs } from './validate';
import { EditPlan, frameSize, parseEditPlan } from './plan';
import { ClaudePlanner, HeuristicPlanner, PlannerError, splitSentences } from './planner';
import { buildFinalGraph, encoderArgs, motionExpr } from './render';
import { outputPathFor } from './studio';
import { buildTimeline, TIMING } from './timeline';

const hasFfmpeg = spawnSync(FFMPEG, ['-version']).status === 0;

function samplePlan(overrides: Partial<EditPlan> = {}): EditPlan {
  return parseEditPlan(
    {
      title: 't',
      voice: 'vi-VN-HoaiMyNeural',
      speechRate: '+0%',
      captions: {
        enabled: true,
        position: 'bottom',
        color: '#ffffff',
        highlightColor: 'FFD400',
        uppercase: false,
        scale: 1,
      },
      musicVolume: 0.2,
      scenes: [
        {
          imageIndex: 0,
          narration: 'Xin chào các bạn.',
          motion: 'zoom_in',
          fit: 'cover',
          transition: 'fade',
          minDuration: 2,
        },
        {
          imageIndex: 1,
          narration: '',
          motion: 'pan_left',
          fit: 'contain_blur',
          transition: 'cut',
          minDuration: 3,
        },
        {
          imageIndex: 5,
          narration: 'Hẹn gặp lại.',
          motion: 'static',
          fit: 'cover',
          transition: 'slideup',
          minDuration: 2,
        },
      ],
      ...overrides,
    },
    2,
  );
}

describe('parseEditPlan', () => {
  it('clamps image indexes, normalises colours and ends on a cut', () => {
    const plan = samplePlan();
    expect(plan.scenes[2].imageIndex).toBe(1);
    expect(plan.captions.highlightColor).toBe('#FFD400');
    expect(plan.scenes[2].transition).toBe('cut');
  });

  it('falls back to safe defaults for unknown values', () => {
    const plan = parseEditPlan(
      {
        voice: 'x',
        speechRate: 'fast',
        scenes: [
          {
            imageIndex: 0,
            narration: 'a',
            motion: 'spin',
            transition: 'boom',
            fit: '?',
            minDuration: 99,
          },
        ],
      },
      1,
    );
    expect(plan.speechRate).toBe('+0%');
    expect(plan.scenes[0].motion).toBe('zoom_in');
    expect(plan.scenes[0].fit).toBe('contain_blur');
    expect(plan.scenes[0].minDuration).toBe(2.5);
  });

  it('rejects plans without scenes', () => {
    expect(() => parseEditPlan({ scenes: [] }, 1)).toThrow();
  });
});

describe('buildTimeline', () => {
  it('fits each scene to its narration and overlaps clips by the transition length', () => {
    const plan = samplePlan();
    const tl = buildTimeline(plan, [4, 0, 1]);
    const [a, b, c] = tl.scenes;
    expect(a.duration).toBeCloseTo(TIMING.lead + 4 + TIMING.tail);
    expect(a.clipLength).toBeCloseTo(a.duration + TIMING.transition);
    expect(b.start).toBeCloseTo(a.duration);
    expect(b.duration).toBe(3); // silent scene keeps its minimum
    expect(b.transitionDuration).toBe(TIMING.cut);
    expect(c.duration).toBe(2); // short narration -> minDuration wins
    expect(c.transitionDuration).toBe(0);
    expect(c.audioStart).toBeCloseTo(c.start + TIMING.lead);
    expect(tl.total).toBeCloseTo(a.duration + 3 + 2);
  });

  it('requires one duration per scene', () => {
    expect(() => buildTimeline(samplePlan(), [1])).toThrow();
  });
});

describe('captions', () => {
  it('estimates word timings across the window', () => {
    const words = estimateWordTimings('một hai ba bốn', 1, 4);
    expect(words).toHaveLength(4);
    expect(words[0].start).toBe(1);
    expect(words[3].end).toBeCloseTo(5);
    expect(estimateWordTimings('   ', 0, 3)).toEqual([]);
  });

  it('aligns script words (with punctuation) to TTS word timings', () => {
    const tts = [
      { text: 'Xin', start: 0.1, end: 0.3 },
      { text: 'chào', start: 0.3, end: 0.6 },
      { text: 'các', start: 0.7, end: 0.9 },
      { text: 'bạn', start: 0.9, end: 1.2 },
    ];
    const words = alignWords('Xin chào, – các bạn!', tts, 10, 2);
    expect(words.map((w) => w.text)).toEqual(['Xin', 'chào,', '–', 'các', 'bạn!']);
    expect(words[1].start).toBeCloseTo(10.3);
    expect(words[4].end).toBeCloseTo(11.2);
    // the dash is interpolated between its neighbours
    expect(words[2].start).toBeGreaterThanOrEqual(10.6);
    expect(words[2].end).toBeLessThanOrEqual(10.7 + 1e-9);
  });

  it('falls back to estimates when TTS words do not match', () => {
    const words = alignWords('một hai ba', [{ text: 'zzz', start: 0, end: 1 }], 0, 3);
    expect(words).toHaveLength(3);
    expect(words[2].end).toBeCloseTo(1);
  });

  it('groups words into short lines and closes small gaps', () => {
    const words = estimateWordTimings('một hai, ba bốn năm sáu bảy', 0, 7);
    const cues = groupWords(words, 4, 0);
    expect(cues.map((c) => c.words.map((w) => w.text).join(' '))).toEqual([
      'một hai,',
      'ba bốn năm sáu',
      'bảy',
    ]);
    expect(cues[0].end).toBe(cues[1].start);
  });

  it('formats ASS colours and times', () => {
    expect(assColor('#FFD400')).toBe('&H0000D4FF');
    expect(assTime(3725.456)).toBe('1:02:05.46');
  });

  it('writes the hook, captions and caption overrides (plain style)', () => {
    const plan = samplePlan({ hookText: 'Tiêu {đề}' });
    plan.captions.style = 'plain';
    plan.scenes[1].caption = 'Chữ riêng';
    const ass = buildAss(plan, buildTimeline(plan, [2, 0, 1]), {
      aspect: '9:16',
      fontName: 'Arial',
    });
    expect(ass).toContain('PlayResX: 1080');
    expect(ass).toMatch(/,Hook,,0,0,0,,\{[^}]*\\fscx75[^}]*\}Tiêu đề/);
    expect(ass).toContain('Chữ riêng');
    expect(ass).toContain('Hẹn gặp lại.');
  });

  it('karaoke: one event per word with the spoken word highlighted, emphasis coloured', () => {
    const plan = samplePlan();
    plan.scenes[0].narration = 'Giảm giá 50% hôm nay';
    plan.scenes[0].emphasis = ['50%'];
    const timeline = buildTimeline(plan, [2, 0, 1]);
    const ass = buildAss(plan, timeline, { aspect: '16:9', fontName: 'Arial' });
    const events = ass.split('\n').filter((l) => l.startsWith('Dialogue: 0,') && l.includes('hôm'));
    expect(events).toHaveLength(5);
    const hl = '\\c&H0000D4FF';
    // word 0 active: dark text on a highlight-coloured marker stroke, plus the pop-in
    expect(events[0]).toMatch(
      /\{\\c&H00141414&\\3c&H0000D4FF\\bord\d+\\shad0\\fscx112\\fscy112\}Giảm\{\\r\}/,
    );
    expect(events[0]).toContain('\\t(0,90');
    // the emphasised word is coloured even when not active
    expect(events[0]).toContain(`{${hl}}50%{\\r}`);
    expect(events[3]).toMatch(/\\fscy112\}hôm\{\\r\}/);
  });

  it('box style colours the active word instead of stroking it; phrases emphasise each word', () => {
    const plan = samplePlan();
    plan.captions.box = true;
    plan.scenes[0].narration = 'Ảnh rõ nét luôn bán chạy';
    plan.scenes[0].emphasis = ['rõ nét'];
    const ass = buildAss(plan, buildTimeline(plan, [2, 0, 1]), {
      aspect: '16:9',
      fontName: 'Arial',
    });
    const first = ass.split('\n').find((l) => l.startsWith('Dialogue: 0,') && l.includes('chạy'))!;
    expect(first).toContain('{\\c&H0000D4FF\\fscx112\\fscy112}Ảnh{\\r}');
    expect(first).toContain('{\\c&H0000D4FF}rõ{\\r} {\\c&H0000D4FF}nét{\\r}');
  });

  it('balances long headlines over hard line breaks', () => {
    expect(balanceLines('Bí quyết bán hàng online 2026', 18)).toBe(
      'Bí quyết bán\\Nhàng online 2026',
    );
    expect(balanceLines('Ngắn gọn', 18)).toBe('Ngắn gọn');
  });

  it('uses TTS word timings when provided', () => {
    const plan = samplePlan();
    const timeline = buildTimeline(plan, [2, 0, 1]);
    const cues = buildCaptionCues(plan, timeline, '9:16', [
      [
        { text: 'Xin', start: 0, end: 0.5 },
        { text: 'chào', start: 0.6, end: 1 },
        { text: 'các', start: 1.2, end: 1.4 },
        { text: 'bạn', start: 1.4, end: 1.9 },
      ],
    ]);
    expect(cues[0].words[2].start).toBeCloseTo(timeline.scenes[0].audioStart + 1.2);
  });

  it('parses TTS word JSON defensively', () => {
    expect(
      parseTtsWords('[{"text":"a","start":0,"end":0.2},{"text":"b","start":"x"},{"bad":1}]'),
    ).toEqual([{ text: 'a', start: 0, end: 0.2 }]);
    expect(parseTtsWords('{}')).toEqual([]);
  });
});

describe('sound effects', () => {
  it('places a hit under the hook, whooshes on transitions, ticks on cuts and pops on lines', () => {
    const plan = samplePlan({ hookText: 'Hook' });
    plan.scenes[0].narration = 'một hai ba bốn năm sáu bảy tám chín mười mười một mười hai';
    const timeline = buildTimeline(plan, [4, 0, 1]);
    const cues = buildCaptionCues(plan, timeline, '9:16');
    const events = planSfx(plan, timeline, cues);
    const kinds = events.map((e) => e.sound);
    expect(kinds[0]).toBe('hit');
    expect(kinds.filter((k) => k === 'whoosh')).toHaveLength(1); // scene 0 -> 1 (fade)
    expect(kinds.filter((k) => k === 'tick')).toHaveLength(1); // scene 1 -> 2 (cut)
    expect(kinds.some((k) => k.startsWith('pop'))).toBe(true);
    const whoosh = events.find((e) => e.sound === 'whoosh')!;
    // whoosh peak (0.35s in) lands in the middle of the crossfade
    expect(whoosh.time + 0.35).toBeCloseTo(timeline.scenes[1].start + 0.25);
    // no pop stacked on top of the hit
    expect(events.filter((e) => e.sound.startsWith('pop') && e.time < 0.3)).toHaveLength(0);
  });

  it('respects sfx settings', () => {
    const plan = samplePlan();
    plan.sfx.captionPop = false;
    const timeline = buildTimeline(plan, [4, 0, 1]);
    const cues = buildCaptionCues(plan, timeline, '9:16');
    expect(planSfx(plan, timeline, cues).some((e) => e.sound.startsWith('pop'))).toBe(false);
    plan.sfx.enabled = false;
    expect(planSfx(plan, timeline, cues)).toEqual([]);
  });

  it('builds one mixed track with a delayed copy per event', () => {
    const { graph, inputs } = buildSfxGraph(
      [
        { sound: 'whoosh', time: 1, gain: 0.5 },
        { sound: 'whoosh', time: 3.25, gain: 0.5 },
        { sound: 'pop0', time: 2, gain: 0.3 },
      ],
      ['whoosh', 'pop0'],
    );
    expect(inputs).toBe(3);
    expect(graph).toContain('asplit=2[s0_0][s0_1]');
    expect(graph).toContain('adelay=3250|3250');
    expect(graph).toContain('amix=inputs=4:normalize=0:duration=first[sfx]');
  });
});

describe('render graph', () => {
  it('chains xfades at scene start offsets and mixes narration with delays', () => {
    const plan = samplePlan();
    const timeline = buildTimeline(plan, [2, 0, 1]);
    const { graph, voiceInputs, silenceInput, musicInput } = buildFinalGraph(
      { plan, timeline, narration: ['a.mp3', null, 'c.mp3'], music: 'm.mp3', sfxTrack: 'fx.wav' },
      'captions.ass',
    );
    expect(silenceInput).toBe(3);
    expect(voiceInputs).toEqual([4, 5]);
    expect(musicInput).toBe(6);
    expect(graph).toContain(
      `xfade=transition=fade:duration=0.500:offset=${timeline.scenes[1].start.toFixed(3)}`,
    );
    // "cut" is rendered as a near-instant fade
    expect(graph).toContain(
      `xfade=transition=fade:duration=0.040:offset=${timeline.scenes[2].start.toFixed(3)}`,
    );
    expect(graph).toContain(`adelay=${Math.round(timeline.scenes[2].audioStart * 1000)}`);
    expect(graph).toContain('sidechaincompress');
    expect(graph).toContain('amix=inputs=3');
    expect(graph).toContain('[7:a]aresample');
    expect(graph).toContain('[bed][fx]amix=inputs=2');
  });

  it('builds zoompan expressions for every motion', () => {
    expect(motionExpr('zoom_in', 90).z).toContain('1+0.12*');
    expect(motionExpr('pan_right', 90).x).toContain('(iw-iw/zoom)*');
    expect(motionExpr('static', 90)).toEqual({ z: '1', x: '0', y: '0' });
  });
});

describe('planners', () => {
  it('splitSentences keeps punctuation', () => {
    expect(splitSentences('Câu một. Câu hai!\nCâu ba')).toEqual(['Câu một.', 'Câu hai!', 'Câu ba']);
  });

  it('heuristic planner covers the full script and every image', async () => {
    const script = 'Một hai ba bốn năm. Sáu bảy tám chín mười. Mười một mười hai. Kết thúc nhé.';
    const plan = await new HeuristicPlanner().plan({
      images: ['a', 'b', 'c'],
      script,
      aspect: '9:16',
    });
    expect(
      plan.scenes
        .map((s) => s.narration)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    ).toBe(script);
    expect(new Set(plan.scenes.map((s) => s.imageIndex))).toEqual(new Set([0, 1, 2]));
  });

  it.skipIf(!hasFfmpeg)(
    'Claude planner sends images + script and parses the tool call',
    async () => {
      const dir = mkdtempSync(path.join(os.tmpdir(), 'vs-'));
      const img = path.join(dir, 'a.png');
      await run(FFMPEG, [
        '-y',
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=red:s=64x64',
        '-frames:v',
        '1',
        img,
      ]);

      let sent: any;
      const client = {
        messages: {
          create: async (params: any) => {
            sent = params;
            return {
              stop_reason: 'tool_use',
              content: [
                {
                  type: 'tool_use',
                  id: 't1',
                  name: 'submit_edit_plan',
                  input: {
                    title: 'x',
                    voice: 'vi-VN-NamMinhNeural',
                    speechRate: '+10%',
                    captions: {
                      enabled: true,
                      position: 'center',
                      color: '#FFFFFF',
                      highlightColor: '#FF0000',
                      uppercase: true,
                      scale: 1.2,
                    },
                    musicVolume: 0.1,
                    scenes: [
                      {
                        imageIndex: 0,
                        narration: 'Chào',
                        motion: 'zoom_out',
                        fit: 'cover',
                        transition: 'fade',
                        minDuration: 2,
                      },
                    ],
                  },
                },
              ],
            };
          },
        },
      } as any;

      const plan = await new ClaudePlanner(dir, { client, model: 'test-model' }).plan({
        images: [img],
        script: 'Chào',
        style: 'năng động',
        aspect: '1:1',
      });
      expect(sent.model).toBe('test-model');
      expect(sent.tool_choice).toEqual({ type: 'tool', name: 'submit_edit_plan' });
      const blocks = sent.messages[0].content;
      expect(
        blocks.some((b: any) => b.type === 'image' && b.source.media_type === 'image/jpeg'),
      ).toBe(true);
      expect(blocks[blocks.length - 1].text).toContain('<script>\nChào\n</script>');
      expect(plan.voice).toBe('vi-VN-NamMinhNeural');
      expect(plan.scenes[0].transition).toBe('cut');
    },
  );
});

describe('outputPathFor', () => {
  it('suffixes the aspect only when rendering several formats', () => {
    expect(outputPathFor('/x/v.mp4', '9:16', false)).toBe('/x/v.mp4');
    expect(outputPathFor('/x/v.mp4', '16:9', true)).toBe('/x/v-16x9.mp4');
  });
});

describe('production hardening', () => {
  const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'vs-prod-'));

  it('keeps 9:16 captions and hook out of the app UI areas', () => {
    const plan = samplePlan({ hookText: 'Hook' });
    const ass = buildAss(plan, buildTimeline(plan, [2, 0, 1]), {
      aspect: '9:16',
      fontName: 'Arial',
    });
    const caption = ass
      .split('\n')
      .find((l) => l.startsWith('Style: Caption'))!
      .split(',');
    const hook = ass
      .split('\n')
      .find((l) => l.startsWith('Style: Hook'))!
      .split(',');
    // MarginV is the 22nd field; bottom captions sit above the bottom 40% (Reels UI + action rail)
    expect(Number(caption[21])).toBeGreaterThanOrEqual(Math.round(1920 * 0.4));
    expect(Number(hook[21])).toBeGreaterThanOrEqual(Math.round(1920 * 0.14));
    // side margins ≥ 6%
    expect(Number(caption[19])).toBeGreaterThanOrEqual(Math.round(1080 * 0.06));
  });

  it('previews render at half resolution with the same layout', () => {
    expect(frameSize('9:16', 'preview')).toEqual({ width: 540, height: 960 });
    expect(frameSize('16:9', 'final')).toEqual({ width: 1920, height: 1080 });
    const plan = samplePlan();
    const ass = buildAss(plan, buildTimeline(plan, [2, 0, 1]), {
      aspect: '9:16',
      quality: 'preview',
      fontName: 'Arial',
    });
    expect(ass).toContain('PlayResX: 540');
  });

  it('final encode follows the platform recommendations', () => {
    const args = encoderArgs('final').join(' ');
    expect(args).toContain('-profile:v high');
    expect(args).toContain('-g 15');
    expect(args).toContain('-bf 2');
    expect(args).toContain('-ar 48000');
    expect(args).toContain('+faststart');
  });

  it('file cache writes atomically and reuses entries', async () => {
    const cache = new FileCache(tmp());
    let calls = 0;
    const make = async (p: string) => {
      calls++;
      await fs.writeFile(p, 'x');
    };
    const a = await cache.getOrCreate('abcd', '.txt', make);
    const b = await cache.getOrCreate('abcd', '.txt', make);
    expect(a).toBe(b);
    expect(calls).toBe(1);
    await expect(
      cache.getOrCreate('efgh', '.txt', async () => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');
    expect(cache.has('efgh', '.txt')).toBe(false);
  });

  it('caches TTS output per text + voice + rate', async () => {
    const dir = tmp();
    let calls = 0;
    const inner = {
      name: 'fake',
      synthesize: async (_t: string, _v: string, _r: string, out: string) => {
        calls++;
        await fs.writeFile(`${out}.mp3`, 'audio');
        return { file: `${out}.mp3`, duration: 1.5, words: [{ text: 'a', start: 0, end: 0.3 }] };
      },
    };
    const tts = new CachedTts(inner, new FileCache(path.join(dir, 'cache')));
    const r1 = await tts.synthesize('xin chào', 'v', '+0%', path.join(dir, 'a'));
    const r2 = await tts.synthesize('xin chào', 'v', '+0%', path.join(dir, 'b'));
    await tts.synthesize('xin chào', 'v', '+10%', path.join(dir, 'c'));
    expect(calls).toBe(2);
    expect(r2.file).toBe(r1.file);
    expect(r2.words).toEqual([{ text: 'a', start: 0, end: 0.3 }]);
  });

  it.skipIf(!hasFfmpeg)('rejects files that are not real images or are too large', async () => {
    const dir = tmp();
    const fake = path.join(dir, 'fake.jpg');
    await fs.writeFile(fake, '#EXTM3U\nhttp://example.com/x.ts\n');
    await expect(validateInputs({ images: [fake], script: 'a' })).rejects.toThrow(
      InputValidationError,
    );
    const img = path.join(dir, 'ok.png');
    await run(FFMPEG, [
      '-y',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=blue:s=64x64',
      '-frames:v',
      '1',
      img,
    ]);
    await expect(validateInputs({ images: [img], script: 'a' })).resolves.toBeUndefined();
    await expect(
      validateInputs({ images: [img], script: 'a' }, { ...DEFAULT_LIMITS, maxImageSide: 32 }),
    ).rejects.toThrow('longest side');
    await expect(
      validateInputs(
        { images: [img], script: 'x'.repeat(10) },
        { ...DEFAULT_LIMITS, maxScriptChars: 5 },
      ),
    ).rejects.toThrow('characters');
  });

  it.skipIf(!hasFfmpeg)('stops commands on timeout and on cancel', async () => {
    const slow = ['-v', 'error', '-re', '-f', 'lavfi', '-i', 'sine=d=600', '-f', 'null', '-'];
    await expect(run(FFMPEG, slow, { timeoutMs: 300 })).rejects.toBeInstanceOf(CommandTimeoutError);
    const ac = new AbortController();
    const p = withSignal(ac.signal, () => run(FFMPEG, slow));
    setTimeout(() => ac.abort(), 200);
    await expect(p).rejects.toBeInstanceOf(CancelledError);
  });

  it('Claude planner: strict tool, usage reporting, retry on max_tokens, refusal', async () => {
    const dir = tmp();
    const img = path.join(dir, 'a.png');
    if (hasFfmpeg) {
      await run(FFMPEG, [
        '-y',
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=red:s=32x32',
        '-frames:v',
        '1',
        img,
      ]);
    } else return;
    const input = {
      title: 'x',
      voice: 'vi-VN-HoaiMyNeural',
      speechRate: '+0%',
      captions: {
        enabled: true,
        style: 'pop',
        box: true,
        position: 'center',
        color: '#FFFFFF',
        highlightColor: '#00E5FF',
        uppercase: false,
        scale: 1,
      },
      sfx: { enabled: true, volume: 0.5, captionPop: false },
      musicVolume: 0.1,
      scenes: [
        {
          imageIndex: 0,
          narration: 'Chào',
          motion: 'zoom_in',
          fit: 'cover',
          transition: 'fade',
          minDuration: 2,
        },
      ],
      post: { caption: 'Xem ngay', hashtags: ['shop', '#ban hang'], youtubeTitle: 'Tiêu đề' },
    };
    const calls: any[] = [];
    const responses = [
      {
        stop_reason: 'max_tokens',
        model: 'm',
        usage: { input_tokens: 100, output_tokens: 16000 },
        content: [],
      },
      {
        stop_reason: 'tool_use',
        model: 'm',
        usage: { input_tokens: 100, output_tokens: 500, cache_read_input_tokens: 80 },
        content: [{ type: 'tool_use', id: 't', name: 'submit_edit_plan', input }],
      },
    ];
    const client = {
      messages: {
        create: async (p: any) => {
          calls.push(p);
          return responses.shift();
        },
      },
    } as any;
    const usage: any[] = [];
    const plan = await new ClaudePlanner(dir, { client }).plan({
      images: [img],
      script: 'Chào',
      aspect: '9:16',
      onUsage: (u) => {
        usage.push(u);
      },
    });
    expect(calls[0].tools[0].strict).toBe(true);
    expect(calls[0].system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(calls[1].max_tokens).toBe(32000);
    expect(usage).toHaveLength(2);
    expect(usage[1]).toMatchObject({ inputTokens: 100, outputTokens: 500, cacheReadTokens: 80 });
    expect(plan.post?.hashtags).toEqual(['#shop', '#banhang']);

    const refuse = {
      messages: { create: async () => ({ stop_reason: 'refusal', usage: {}, content: [] }) },
    } as any;
    await expect(
      new ClaudePlanner(dir, { client: refuse }).plan({
        images: [img],
        script: 'x',
        aspect: '9:16',
      }),
    ).rejects.toBeInstanceOf(PlannerError);
  });
});
