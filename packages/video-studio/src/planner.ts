import Anthropic from '@anthropic-ai/sdk';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { FFMPEG, run } from './ffmpeg';
import {
  Aspect,
  EDIT_PLAN_JSON_SCHEMA,
  EditPlan,
  MOTIONS,
  Motion,
  Transition,
  VOICES,
  parseEditPlan,
} from './plan';

export interface PlanUsage {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  durationMs: number;
}

export interface PlanRequest {
  images: string[];
  /** The narration script. */
  script: string;
  /** What the user wants: goal, length, platform, call to action... */
  request?: string;
  /** Visual / tone style: "năng động, TikTok", "điện ảnh, chậm rãi"... */
  style?: string;
  aspect: Aspect;
  /** Force a voice instead of letting the planner choose. */
  voice?: string;
  /** Called once per model call with token usage (for cost tracking). */
  onUsage?: (usage: PlanUsage) => void | Promise<void>;
  signal?: AbortSignal;
}

export interface Planner {
  /** Identifies the planner + prompt version, so cached plans are reused only when it matches. */
  readonly id: string;
  plan(req: PlanRequest): Promise<EditPlan>;
}

export class PlannerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlannerError';
  }
}

/** Bump when the prompt or schema changes so cached plans are not reused across versions. */
export const PLAN_PROMPT_VERSION = 'plan-v3';

const SYSTEM_PROMPT = `You are a senior short-form video editor. You receive numbered images, a narration script, the creator's request and a style description. You decide how to cut the video and return the edit plan by calling the submit_edit_plan tool.

Rules:
- Narration: use the creator's script as the spoken text. Keep its words and language (usually Vietnamese). Only rewrite it if the request explicitly asks you to. Split it into scenes at natural sentence or clause boundaries; across all scenes the narration must cover the whole script in order.
- Pick for each scene the image that best illustrates what is being said. You may reuse an image or leave one out if it does not fit. Look at the images carefully.
- One scene = one image on screen. Aim for 2-6 seconds of speech per scene (about 8-25 Vietnamese words); fast, energetic styles use shorter scenes.
- motion: vary it between scenes. Use pan_left/pan_right on wide images, pan_up/pan_down on tall ones, zoom_in for emphasis, zoom_out for reveals, static only when the image has text that must stay readable.
- fit: "cover" when the image roughly matches the output frame or cropping loses nothing important; "contain_blur" when cropping would cut off faces, products or text.
- transition: match the style. Energetic: slides, smooth, zoomin, some cuts. Calm/cinematic: fade, dissolve, fadeblack. Don't use the same one every time unless the style asks for it.
- hookText: a short headline for the first seconds when the platform is TikTok/Reels/Shorts or the request asks for a hook; otherwise omit it.
- voice: vi-VN-HoaiMyNeural (female) or vi-VN-NamMinhNeural (male), whichever suits the content and the request.
- captions: usually enabled; position "center" or "bottom" (the renderer keeps both clear of the app UI). style "karaoke" (spoken word lights up) for TikTok/Reels/Shorts and energetic content, "pop" for punchy promos, "plain" for calm or formal videos. box=true when the images are busy or bright behind the text. Choose highlightColor to pop against the images (yellow #FFD400, green #39FF14, cyan #00E5FF, pink #FF2E93...).
- emphasis: per scene, 0-3 words copied exactly from that scene's narration that carry the message (numbers, prices, product names, strong verbs). They are coloured in the captions.
- sfx: whoosh on image changes, pop as caption lines appear, hit under the hook. enabled for social videos; volume ~0.8 energetic, ~0.4 calm; captionPop false for calm/formal styles.
- post: the caption, hashtags and YouTube title the creator will publish with the video, in the script's language, true to the script.
- Never invent facts the script does not contain.`;

const PLAN_TOOL_NAME = 'submit_edit_plan';

/** Downscale an image to a JPEG small enough for the API (long side ≤ 1568 px). */
async function prepareImageForModel(file: string, workDir: string, index: number): Promise<string> {
  const out = path.join(workDir, `model-input-${index}.jpg`);
  await run(FFMPEG, [
    '-y',
    '-v',
    'error',
    '-protocol_whitelist',
    'file',
    '-i',
    file,
    '-vf',
    "scale='min(1568,iw)':'min(1568,ih)':force_original_aspect_ratio=decrease",
    '-frames:v',
    '1',
    '-q:v',
    '4',
    out,
  ]);
  return out;
}

export interface ClaudePlannerOptions {
  model?: string;
  apiKey?: string;
  /** Inject a client (tests, custom base URL / proxy). */
  client?: Pick<Anthropic, 'messages'>;
}

type CreateParams = Parameters<Anthropic['messages']['create']>[0];

export class ClaudePlanner implements Planner {
  private client: Pick<Anthropic, 'messages'>;
  private readonly model: string;

  constructor(
    private readonly workDir: string,
    opts: ClaudePlannerOptions = {},
  ) {
    this.model = opts.model || process.env.VIDEO_PLANNER_MODEL || 'claude-sonnet-5-5';
    if (opts.client) {
      this.client = opts.client;
    } else {
      const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new PlannerError('ANTHROPIC_API_KEY is not set');
      // The SDK retries 429 / 5xx / overloaded with backoff.
      this.client = new Anthropic({ apiKey, maxRetries: 3, timeout: 180_000 });
    }
  }

  get id(): string {
    return `claude:${this.model}:${PLAN_PROMPT_VERSION}`;
  }

  async plan(req: PlanRequest): Promise<EditPlan> {
    await fs.mkdir(this.workDir, { recursive: true });
    const content: Anthropic.ContentBlockParam[] = [];
    for (let i = 0; i < req.images.length; i++) {
      const small = await prepareImageForModel(req.images[i], this.workDir, i);
      const data = (await fs.readFile(small)).toString('base64');
      content.push({ type: 'text', text: `Image ${i}:` });
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } });
    }
    content.push({
      type: 'text',
      text: [
        `Output aspect ratio: ${req.aspect}`,
        `Request: ${req.request?.trim() || '(none)'}`,
        `Style: ${req.style?.trim() || '(none — choose something fitting)'}`,
        req.voice ? `Voice: must be ${req.voice}` : '',
        '',
        '<script>',
        req.script.trim(),
        '</script>',
      ]
        .filter((l) => l !== '')
        .join('\n'),
    });

    const params: CreateParams = {
      model: this.model,
      max_tokens: 16_000,
      // Same prefix (tools + system) on every call: cache it.
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: [
        {
          name: PLAN_TOOL_NAME,
          description: 'Submit the final edit plan for rendering.',
          // strict: the tool input is guaranteed to match the schema (constrained decoding).
          strict: true,
          input_schema: EDIT_PLAN_JSON_SCHEMA as unknown as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: 'tool', name: PLAN_TOOL_NAME },
      messages: [{ role: 'user', content }],
      stream: false,
    };

    let response = await this.call(params, req);
    if (response.stop_reason === 'max_tokens') {
      // Long scripts with many scenes: one more try with room to finish.
      response = await this.call({ ...params, max_tokens: 32_000 }, req);
    }
    if (response.stop_reason === 'refusal') {
      throw new PlannerError('The model declined to plan this video. Check the script and images.');
    }
    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === PLAN_TOOL_NAME,
    );
    if (!toolUse) {
      throw new PlannerError(
        `The model returned no edit plan (stop_reason: ${response.stop_reason})`,
      );
    }

    const plan = parseEditPlan(toolUse.input, req.images.length);
    if (req.voice) plan.voice = req.voice;
    return plan;
  }

  private async call(params: CreateParams, req: PlanRequest): Promise<Anthropic.Message> {
    const started = Date.now();
    const response = (await this.client.messages.create(params, {
      signal: req.signal,
    })) as Anthropic.Message;
    const u = response.usage;
    await req.onUsage?.({
      provider: 'anthropic',
      model: response.model || this.model,
      inputTokens: u?.input_tokens ?? 0,
      outputTokens: u?.output_tokens ?? 0,
      cacheReadTokens: u?.cache_read_input_tokens ?? 0,
      cacheWriteTokens: u?.cache_creation_input_tokens ?? 0,
      durationMs: Date.now() - started,
    });
    return response;
  }
}

/** Split text into sentences, keeping the punctuation. */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?…;])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Offline planner used without an API key or for quick drafts:
 * groups sentences into scenes of ~maxWords words and spreads them across the images in order.
 */
export class HeuristicPlanner implements Planner {
  readonly id = `heuristic:${PLAN_PROMPT_VERSION}`;

  async plan(req: PlanRequest): Promise<EditPlan> {
    const maxWords = /tiktok|nhanh|năng động|energetic|fast/i.test(`${req.style} ${req.request}`)
      ? 14
      : 22;
    const chunks: string[] = [];
    let current = '';
    for (const sentence of splitSentences(req.script)) {
      const candidate = current ? `${current} ${sentence}` : sentence;
      if (current && candidate.split(' ').length > maxWords) {
        chunks.push(current);
        current = sentence;
      } else {
        current = candidate;
      }
    }
    if (current) chunks.push(current);
    // Make sure every image is shown at least once.
    while (chunks.length < req.images.length) chunks.push('');

    const transitions: Transition[] = ['fade', 'slideleft', 'dissolve', 'smoothup', 'circleopen'];
    const motions: Motion[] = MOTIONS.filter((m) => m !== 'static');
    const raw = {
      title: 'video',
      voice: req.voice || VOICES[0],
      speechRate: '+0%',
      captions: {
        enabled: true,
        style: 'karaoke',
        box: false,
        position: req.aspect === '16:9' ? 'bottom' : 'center',
        color: '#FFFFFF',
        highlightColor: '#FFD400',
        uppercase: false,
        scale: 1,
      },
      sfx: { enabled: true, volume: 0.7, captionPop: true },
      musicVolume: 0.15,
      post: { caption: '', hashtags: [], youtubeTitle: '' },
      scenes: chunks.map((narration, i) => ({
        emphasis: narration
          .split(/\s+/)
          .filter((w) => /\d/.test(w))
          .slice(0, 3),
        imageIndex: Math.floor((i * req.images.length) / chunks.length),
        narration,
        motion: motions[i % motions.length],
        fit: 'contain_blur',
        transition: transitions[i % transitions.length],
        minDuration: 2.5,
      })),
    };
    return parseEditPlan(raw, req.images.length);
  }
}
