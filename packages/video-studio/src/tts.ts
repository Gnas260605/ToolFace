import { FFMPEG, probeDuration, run } from './ffmpeg';

export interface TtsResult {
  /** Audio file (any format FFmpeg reads). */
  file: string;
  duration: number;
}

export interface TtsEngine {
  readonly name: string;
  synthesize(text: string, voice: string, rate: string, outFileNoExt: string): Promise<TtsResult>;
}

/**
 * Microsoft Edge neural voices through the `edge-tts` command-line tool
 * (install once with: pip install edge-tts). Free, no API key, good Vietnamese voices.
 */
export class EdgeTts implements TtsEngine {
  readonly name = 'edge-tts';

  constructor(private readonly bin: string = process.env.EDGE_TTS_PATH || 'edge-tts') {}

  async synthesize(
    text: string,
    voice: string,
    rate: string,
    outFileNoExt: string,
  ): Promise<TtsResult> {
    const file = `${outFileNoExt}.mp3`;
    // `--rate=+0%` must be glued with "=" or argparse reads "-5%" as a flag.
    try {
      await run(this.bin, [
        '--voice',
        voice,
        `--rate=${rate}`,
        '--text',
        text,
        '--write-media',
        file,
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `edge-tts failed (it needs an internet connection to speech.platform.bing.com). ` +
          `Use --no-voice to render without narration.\n${msg}`,
      );
    }
    return { file, duration: await probeDuration(file) };
  }

  static async isAvailable(
    bin: string = process.env.EDGE_TTS_PATH || 'edge-tts',
  ): Promise<boolean> {
    try {
      await run(bin, ['--help']);
      return true;
    } catch {
      return false;
    }
  }
}

/** Approximate speaking time: ~2.8 words per second for Vietnamese news-style narration. */
export function estimateSpeechSeconds(text: string, rate = '+0%'): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const factor = 1 + parseInt(rate, 10) / 100;
  return words === 0 ? 0 : words / (2.8 * (factor > 0 ? factor : 1));
}

/** No voice: silent audio as long as the text would take to read. Captions still show the text. */
export class SilentTts implements TtsEngine {
  readonly name = 'silent';

  async synthesize(
    text: string,
    _voice: string,
    rate: string,
    outFileNoExt: string,
  ): Promise<TtsResult> {
    const duration = Math.max(0.2, estimateSpeechSeconds(text, rate));
    const file = `${outFileNoExt}.wav`;
    await run(FFMPEG, [
      '-y',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'anullsrc=r=44100:cl=stereo',
      '-t',
      duration.toFixed(3),
      file,
    ]);
    return { file, duration };
  }
}
