#!/usr/bin/env node
import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ASPECTS, Aspect, CAPTION_STYLES, CaptionStyle } from './plan';
import { createVideo } from './studio';

const HELP = `video-studio — biến ảnh + kịch bản thành video hoàn chỉnh

Cách dùng:
  pnpm --filter @newsflow/video-studio studio -- [tuỳ chọn]

Đầu vào:
  -i, --image <file>       Ảnh (lặp lại nhiều lần, theo thứ tự)
      --images-dir <dir>   Hoặc lấy mọi ảnh trong thư mục (sắp theo tên)
  -s, --script <file|text> Kịch bản lời đọc (đường dẫn .txt hoặc chữ trực tiếp)
  -r, --request <text>     Yêu cầu: mục đích, nền tảng, độ dài, lời kêu gọi...
      --style <text>       Phong cách: "năng động kiểu TikTok", "điện ảnh, chậm"...
  -a, --aspect <list>      9:16, 16:9, 1:1 (cách nhau bằng dấu phẩy). Mặc định 9:16

Đầu ra & tuỳ chỉnh:
  -o, --out <file>         File video (mặc định output/video.mp4)
      --voice <name>       vi-VN-HoaiMyNeural (nữ) | vi-VN-NamMinhNeural (nam)
      --music <file>       Nhạc nền (tự giảm âm khi có giọng đọc)
      --no-voice           Không lồng tiếng, chỉ phụ đề
      --caption-style <s>  karaoke (chữ sáng theo giọng) | pop (bật từng dòng) | plain
      --no-sfx             Tắt hiệu ứng âm thanh (whoosh, pop...)
      --preview            Bản xem trước nhanh (nửa độ phân giải, tô vùng bị giao diện app che)
      --no-cache           Không dùng bộ nhớ đệm (luôn gọi AI, đọc giọng, render lại)
      --sfx-dir <dir>      Dùng âm thanh của bạn: whoosh/pop/tick/hit .wav|.mp3
      --plan <file>        Dùng plan.json có sẵn (bỏ qua bước AI lên kế hoạch)
      --plan-only          Chỉ tạo plan.json để xem/sửa trước khi render
      --font <name>        Font phụ đề (phải hỗ trợ tiếng Việt)
      --fonts-dir <dir>    Thư mục chứa file font .ttf/.otf
      --work-dir <dir>     Thư mục tạm (mặc định <out>.work)
  -h, --help

Biến môi trường: ANTHROPIC_API_KEY (bắt buộc để AI xem ảnh và dựng),
VIDEO_PLANNER_MODEL, FFMPEG_PATH, FFPROBE_PATH, EDGE_TTS_PATH.`;

const IMAGE_EXT = /\.(jpe?g|png|webp|bmp|gif|tiff?)$/i;

/** Load ANTHROPIC_API_KEY etc. from .env in the current folder or the monorepo root. */
function loadDotEnv(): void {
  const load = (process as unknown as { loadEnvFile?: (p: string) => void }).loadEnvFile;
  if (!load) return;
  for (const file of [path.resolve('.env'), path.resolve(__dirname, '../../../.env')]) {
    if (existsSync(file)) {
      try {
        load(file);
      } catch {
        // ignore malformed .env
      }
    }
  }
}

async function main(): Promise<void> {
  loadDotEnv();
  // `pnpm run studio -- …` forwards the "--" itself; drop it.
  const args = process.argv.slice(2).filter((a, i) => !(i === 0 && a === '--'));
  const { values } = parseArgs({
    args,
    options: {
      image: { type: 'string', short: 'i', multiple: true },
      'images-dir': { type: 'string' },
      script: { type: 'string', short: 's' },
      request: { type: 'string', short: 'r' },
      style: { type: 'string' },
      aspect: { type: 'string', short: 'a', default: '9:16' },
      out: { type: 'string', short: 'o', default: 'output/video.mp4' },
      voice: { type: 'string' },
      music: { type: 'string' },
      'no-voice': { type: 'boolean', default: false },
      'caption-style': { type: 'string' },
      'no-sfx': { type: 'boolean', default: false },
      preview: { type: 'boolean', default: false },
      'no-cache': { type: 'boolean', default: false },
      'sfx-dir': { type: 'string' },
      plan: { type: 'string' },
      'plan-only': { type: 'boolean', default: false },
      font: { type: 'string' },
      'fonts-dir': { type: 'string' },
      'work-dir': { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    console.log(HELP);
    return;
  }

  const images = [...(values.image ?? [])];
  if (values['images-dir']) {
    const dir = path.resolve(values['images-dir']);
    const names = (await fs.readdir(dir)).filter((n) => IMAGE_EXT.test(n)).sort();
    images.push(...names.map((n) => path.join(dir, n)));
  }
  if (images.length === 0)
    throw new Error('Cần ít nhất 1 ảnh (--image hoặc --images-dir). Xem --help');

  const plan = values.plan ? JSON.parse(await fs.readFile(values.plan, 'utf8')) : undefined;

  let script = values.script ?? '';
  if (script && /\.(txt|md)$/i.test(script)) script = await fs.readFile(script, 'utf8');
  if (!script.trim() && !plan) throw new Error('Cần kịch bản (--script). Xem --help');

  const aspects = values.aspect.split(',').map((a) => a.trim()) as Aspect[];
  for (const a of aspects) {
    if (!ASPECTS.includes(a))
      throw new Error(`Khung hình không hợp lệ: ${a} (chọn ${ASPECTS.join(', ')})`);
  }

  const captionStyle = values['caption-style'] as CaptionStyle | undefined;
  if (captionStyle && !CAPTION_STYLES.includes(captionStyle)) {
    throw new Error(`--caption-style phải là ${CAPTION_STYLES.join(', ')}`);
  }

  const out = path.resolve(values.out);
  const started = Date.now();
  const result = await createVideo({
    images,
    script,
    request: values.request,
    style: values.style,
    aspects,
    output: out,
    workDir: values['work-dir'] ?? `${out.replace(/\.[^.]+$/, '')}.work`,
    voice: values.voice,
    music: values.music,
    noVoice: values['no-voice'],
    noSfx: values['no-sfx'],
    quality: values.preview ? 'preview' : 'final',
    safeZoneGuides: values.preview,
    cacheDir: values['no-cache'] ? null : undefined,
    sfxDir: values['sfx-dir'],
    captionStyle,
    plan,
    planOnly: values['plan-only'],
    fontName: values.font,
    fontsDir: values['fonts-dir'],
    log: (m) => console.log(m),
  });

  if (values['plan-only']) {
    console.log(
      `\nĐã tạo kế hoạch dựng: ${result.planFile}\nSửa nếu muốn, rồi chạy lại với --plan ${result.planFile}`,
    );
    return;
  }
  console.log(`\nXong trong ${((Date.now() - started) / 1000).toFixed(0)}s:`);
  for (const o of result.outputs)
    console.log(`  ${o.aspect}  ${o.duration.toFixed(1)}s  ${o.file}`);
}

main().catch((err: unknown) => {
  console.error(`\n✖ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
