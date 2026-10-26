import { z } from 'zod';

/** Output frame formats the renderer supports. */
export const ASPECTS = ['9:16', '16:9', '1:1'] as const;
export type Aspect = (typeof ASPECTS)[number];

export const RESOLUTIONS: Record<Aspect, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '1:1': { width: 1080, height: 1080 },
};

export const MOTIONS = [
  'zoom_in',
  'zoom_out',
  'pan_left',
  'pan_right',
  'pan_up',
  'pan_down',
  'static',
] as const;
export type Motion = (typeof MOTIONS)[number];

/** Transition INTO the next scene. Names map to FFmpeg xfade transitions, except "cut". */
export const TRANSITIONS = [
  'cut',
  'fade',
  'dissolve',
  'fadeblack',
  'slideleft',
  'slideright',
  'slideup',
  'slidedown',
  'wipeleft',
  'wiperight',
  'circleopen',
  'smoothleft',
  'smoothup',
  'zoomin',
] as const;
export type Transition = (typeof TRANSITIONS)[number];

/** How a picture is fitted into the frame when its shape differs from the video. */
export const FITS = ['cover', 'contain_blur'] as const;
export type Fit = (typeof FITS)[number];

export const VOICES = ['vi-VN-HoaiMyNeural', 'vi-VN-NamMinhNeural'] as const;

const hexColor = z
  .string()
  .regex(/^#?[0-9a-fA-F]{6}$/)
  .transform((c) => (c.startsWith('#') ? c : `#${c}`));

export const SceneSchema = z.object({
  /** 0-based index into the input images. */
  imageIndex: z.number().int().min(0),
  /** What the voice says during this scene. May be empty for a silent beat. */
  narration: z.string().default(''),
  /** On-screen caption override. Empty = captions follow the narration. */
  caption: z.string().optional(),
  motion: z.enum(MOTIONS).catch('zoom_in'),
  fit: z.enum(FITS).catch('contain_blur'),
  transition: z.enum(TRANSITIONS).catch('fade'),
  /** Minimum seconds on screen, even if the narration is shorter. */
  minDuration: z.number().min(0.5).max(30).catch(2.5),
  /** 0-3 key words of the narration to colour/emphasise in the captions. */
  emphasis: z.array(z.string()).catch([]).default([]),
});
export type Scene = z.infer<typeof SceneSchema>;

export const CAPTION_STYLES = ['karaoke', 'pop', 'plain'] as const;
export type CaptionStyle = (typeof CAPTION_STYLES)[number];

const DEFAULT_CAPTIONS = {
  enabled: true,
  style: 'karaoke' as CaptionStyle,
  box: false,
  position: 'bottom' as const,
  color: '#FFFFFF',
  highlightColor: '#FFD400',
  uppercase: false,
  scale: 1,
};

const DEFAULT_SFX = { enabled: true, volume: 0.8, captionPop: true };

export const EditPlanSchema = z.object({
  title: z.string().default('video'),
  /** Big text shown on top of the first seconds — the scroll-stopping hook. */
  hookText: z.string().optional(),
  voice: z.string().catch(VOICES[0]),
  /** Edge TTS rate, e.g. "+10%" or "-5%". */
  speechRate: z
    .string()
    .regex(/^[+-]\d{1,2}%$/)
    .catch('+0%'),
  captions: z
    .object({
      enabled: z.boolean().catch(true),
      /** karaoke = the spoken word lights up; pop = each line pops in; plain = simple fade. */
      style: z.enum(CAPTION_STYLES).catch('karaoke').default('karaoke'),
      /** Dark rounded box behind the text instead of an outline. */
      box: z.boolean().catch(false).default(false),
      position: z.enum(['bottom', 'center', 'top']).catch('bottom'),
      color: hexColor.catch('#FFFFFF'),
      highlightColor: hexColor.catch('#FFD400'),
      uppercase: z.boolean().catch(false),
      /** Relative font size: 1 = default. */
      scale: z.number().min(0.5).max(2).catch(1),
    })
    .catch(DEFAULT_CAPTIONS)
    .default(DEFAULT_CAPTIONS),
  /** Sound effects: whoosh on transitions, pop when captions appear, hit under the hook. */
  sfx: z
    .object({
      enabled: z.boolean().catch(true).default(true),
      volume: z.number().min(0).max(1).catch(0.8).default(0.8),
      captionPop: z.boolean().catch(true).default(true),
    })
    .catch(DEFAULT_SFX)
    .default(DEFAULT_SFX),
  /** Background music loudness 0–1 (only used when a music file is given). */
  musicVolume: z.number().min(0).max(1).catch(0.15),
  scenes: z.array(SceneSchema).min(1),
});
export type EditPlan = z.infer<typeof EditPlanSchema>;

/** Parse untrusted plan JSON (from the model or a file) and clamp it to the available images. */
export function parseEditPlan(raw: unknown, imageCount: number): EditPlan {
  const plan = EditPlanSchema.parse(raw);
  if (imageCount < 1) throw new Error('At least one image is required');
  for (const scene of plan.scenes) {
    if (scene.imageIndex >= imageCount) scene.imageIndex = scene.imageIndex % imageCount;
  }
  // The last scene has nothing to transition into.
  plan.scenes[plan.scenes.length - 1].transition = 'cut';
  return plan;
}

/** JSON Schema handed to Claude as the tool input schema. Kept in sync with EditPlanSchema by hand. */
export const EDIT_PLAN_JSON_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Short file-friendly title for the video' },
    hookText: {
      type: 'string',
      description:
        'Optional punchy 3-8 word headline shown over the first ~2.5 seconds. Same language as the script.',
    },
    voice: {
      type: 'string',
      enum: [...VOICES],
      description: 'Edge TTS voice: HoaiMy = female, NamMinh = male',
    },
    speechRate: { type: 'string', description: 'Speech rate like "+0%", "+10%", "-5%"' },
    captions: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        style: {
          type: 'string',
          enum: [...CAPTION_STYLES],
          description:
            'karaoke = word-by-word highlight (TikTok style); pop = whole line pops in; plain = calm fade',
        },
        box: { type: 'boolean', description: 'Dark box behind the text (good on busy images)' },
        position: { type: 'string', enum: ['bottom', 'center', 'top'] },
        color: { type: 'string', description: 'Hex color like #FFFFFF' },
        highlightColor: { type: 'string', description: 'Hex color for the hook text / emphasis' },
        uppercase: { type: 'boolean' },
        scale: { type: 'number', description: 'Font size multiplier 0.5-2' },
      },
      required: [
        'enabled',
        'style',
        'box',
        'position',
        'color',
        'highlightColor',
        'uppercase',
        'scale',
      ],
    },
    sfx: {
      type: 'object',
      description: 'Sound effects layered under the voice',
      properties: {
        enabled: { type: 'boolean' },
        volume: { type: 'number', description: '0-1; ~0.8 energetic, ~0.4 calm' },
        captionPop: {
          type: 'boolean',
          description:
            'Soft pop each time a caption line appears (energetic styles); false for calm videos',
        },
      },
      required: ['enabled', 'volume', 'captionPop'],
    },
    musicVolume: { type: 'number', description: 'Background music volume 0-1 under the voice' },
    scenes: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          imageIndex: { type: 'integer', description: '0-based index of the input image to show' },
          narration: { type: 'string', description: 'Exact words spoken in this scene' },
          caption: {
            type: 'string',
            description: 'Optional on-screen text if it should differ from the narration',
          },
          motion: { type: 'string', enum: [...MOTIONS] },
          fit: {
            type: 'string',
            enum: [...FITS],
            description:
              'cover = crop to fill the frame; contain_blur = show the whole image over a blurred copy',
          },
          transition: {
            type: 'string',
            enum: [...TRANSITIONS],
            description: 'Transition into the NEXT scene',
          },
          minDuration: { type: 'number', description: 'Minimum seconds on screen' },
          emphasis: {
            type: 'array',
            items: { type: 'string' },
            description:
              '0-3 key words copied exactly from this scene narration (numbers, prices, product names, strong verbs) to colour in the captions',
          },
        },
        required: ['imageIndex', 'narration', 'motion', 'fit', 'transition', 'minDuration'],
      },
    },
  },
  required: ['title', 'voice', 'speechRate', 'captions', 'sfx', 'musicVolume', 'scenes'],
} as const;
