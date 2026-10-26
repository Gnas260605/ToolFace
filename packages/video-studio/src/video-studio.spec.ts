import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assColor, assTime, buildAss, cuesForText } from './captions';
import { FFMPEG, run } from './ffmpeg';
import { EditPlan, parseEditPlan } from './plan';
import { ClaudePlanner, HeuristicPlanner, splitSentences } from './planner';
import { buildFinalGraph, motionExpr } from './render';
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
  it('splits text into timed cues covering the whole window', () => {
    const cues = cuesForText('một hai ba bốn năm sáu bảy tám chín mười', 1, 5, 5);
    expect(cues).toHaveLength(2);
    expect(cues[0].start).toBe(1);
    expect(cues[cues.length - 1].end).toBeCloseTo(6);
    expect(cuesForText('   ', 0, 3, 5)).toEqual([]);
  });

  it('formats ASS colours and times', () => {
    expect(assColor('#FFD400')).toBe('&H0000D4FF');
    expect(assTime(3725.456)).toBe('1:02:05.46');
  });

  it('writes hook, captions and caption overrides', () => {
    const plan = samplePlan({ hookText: 'Tiêu {đề}' });
    plan.scenes[1].caption = 'Chữ riêng';
    const ass = buildAss(plan, buildTimeline(plan, [2, 0, 1]), {
      aspect: '9:16',
      fontName: 'Arial',
    });
    expect(ass).toContain('PlayResX: 1080');
    expect(ass).toContain(',Hook,,0,0,0,,{\\fad(150,250)}Tiêu đề');
    expect(ass).toContain('Chữ riêng');
    expect(ass).toContain('Hẹn gặp lại.');
  });
});

describe('render graph', () => {
  it('chains xfades at scene start offsets and mixes narration with delays', () => {
    const plan = samplePlan();
    const timeline = buildTimeline(plan, [2, 0, 1]);
    const { graph, voiceInputs, silenceInput, musicInput } = buildFinalGraph(
      { plan, timeline, narration: ['a.mp3', null, 'c.mp3'], music: 'm.mp3' },
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
