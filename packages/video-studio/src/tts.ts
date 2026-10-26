import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { FFMPEG, probeDuration, run } from './ffmpeg';

export interface TtsWord {
  text: string;
  /** Seconds from the start of this audio file. */
  start: number;
  end: number;
}

export interface TtsResult {
  /** Audio file (any format FFmpeg reads). */
  file: string;
  duration: number;
  /** Per-word timings when the engine provides them (used for karaoke captions). */
  words?: TtsWord[];
}

const WORDS_HELPER = path.resolve(__dirname, '../scripts/edge_tts_words.py');

function pythonBin(): string {
  return process.env.EDGE_TTS_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
}

/** Parse the helper's JSON output defensively. */
export function parseTtsWords(raw: string): TtsWord[] {
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data)) return [];
  return data
    .filter(
      (w): w is TtsWord =>
        !!w &&
        typeof w.text === 'string' &&
        Number.isFinite(w.start) &&
        Number.isFinite(w.end) &&
        w.end >= w.start,
    )
    .map((w) => ({ text: w.text, start: w.start, end: w.end }));
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

    // Preferred: the Python helper, which also returns word timings for karaoke captions.
    if (existsSync(WORDS_HELPER)) {
      const textFile = `${outFileNoExt}.txt`;
      const wordsFile = `${outFileNoExt}.words.json`;
      await fs.writeFile(textFile, text, 'utf8');
      try {
        await run(pythonBin(), [WORDS_HELPER, textFile, voice, rate, file, wordsFile]);
        const words = parseTtsWords(await fs.readFile(wordsFile, 'utf8'));
        return { file, duration: await probeDuration(file), words };
      } catch {
        // Fall through to the plain CLI (no word timings).
      }
    }

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
