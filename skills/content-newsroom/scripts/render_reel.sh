#!/usr/bin/env bash
# Add a viral-style title frame to a video with ffmpeg.
# Ported from ToolFace's VideoTemplateComposerService.
#
#   bash render_reel.sh --input in.mp4 --output out.mp4 --template headline|banner \
#        --headline "TIÊU ĐỀ" [--page "Tên page"] [--logo logo.png] \
#        [--color "#E11D48"] [--font /path/to/font.ttf]
#
# headline: 1080x1080, yellow title with black outline at the bottom, optional logo top-right.
# banner:   1080x1080, coloured banner (top 400px) with page name + title, video below.
set -euo pipefail

INPUT="" OUTPUT="" TEMPLATE="headline" HEADLINE="" PAGE="" LOGO="" COLOR="#E11D48" FONT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --input) INPUT="$2"; shift 2 ;;
    --output) OUTPUT="$2"; shift 2 ;;
    --template) TEMPLATE="$2"; shift 2 ;;
    --headline) HEADLINE="$2"; shift 2 ;;
    --page) PAGE="$2"; shift 2 ;;
    --logo) LOGO="$2"; shift 2 ;;
    --color) COLOR="$2"; shift 2 ;;
    --font) FONT="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

command -v ffmpeg >/dev/null || { echo "ERROR: ffmpeg is not installed." >&2; exit 1; }
[ -f "$INPUT" ] || { echo "ERROR: input video not found: $INPUT" >&2; exit 1; }
[ -n "$OUTPUT" ] && [ -n "$HEADLINE" ] || { echo "ERROR: --output and --headline are required." >&2; exit 2; }
case "$TEMPLATE" in headline|banner) ;; *) echo "ERROR: --template must be headline or banner" >&2; exit 2 ;; esac
[[ "$COLOR" =~ ^#[0-9A-Fa-f]{6}$ ]] || { echo "ERROR: --color must look like #E11D48" >&2; exit 2; }

# Vietnamese diacritics need a font that has them.
if [ -z "$FONT" ]; then
  for f in \
    /usr/share/fonts/truetype/noto/NotoSans-Bold.ttf \
    /usr/share/fonts/opentype/noto/NotoSans-Bold.ttf \
    /usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf \
    /Library/Fonts/Arial\ Unicode.ttf \
    /System/Library/Fonts/Supplemental/Arial\ Bold.ttf \
    "/c/Windows/Fonts/arialbd.ttf" "C:/Windows/Fonts/arialbd.ttf"; do
    [ -f "$f" ] && { FONT="$f"; break; }
  done
fi
[ -n "$FONT" ] && [ -f "$FONT" ] || { echo "ERROR: no font with Vietnamese glyphs found; pass --font /path/to/font.ttf" >&2; exit 1; }

mkdir -p "$(dirname "$OUTPUT")"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# Text goes through files so quotes, colons and % never need ffmpeg escaping.
# Long titles are wrapped at ~22 characters per line.
printf '%s' "$HEADLINE" | fold -s -w 22 > "$TMP/headline.txt"
printf '%s' "$PAGE" > "$TMP/page.txt"
esc() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e "s/'/\\\\'/g" -e 's/:/\\:/g'; }
FONT_E="$(esc "$FONT")"; HEAD_E="$(esc "$TMP/headline.txt")"; PAGE_E="$(esc "$TMP/page.txt")"

if [ "$TEMPLATE" = "headline" ]; then
  BASE="[0:v]scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080,setsar=1"
  TITLE="drawtext=fontfile='$FONT_E':textfile='$HEAD_E':expansion=none:fontcolor=0xFFE600:fontsize=50:line_spacing=12:x=(w-text_w)/2:y=h-text_h-90:borderw=5:bordercolor=black:shadowcolor=black@0.8:shadowx=3:shadowy=3"
  if [ -n "$LOGO" ] && [ -f "$LOGO" ]; then
    FILTER="$BASE[base];[1:v]scale=140:140[logo];[base][logo]overlay=W-w-40:40,$TITLE[v]"
    INPUTS=(-i "$INPUT" -i "$LOGO")
  else
    FILTER="$BASE,$TITLE[v]"
    INPUTS=(-i "$INPUT")
  fi
else
  HEX="0x${COLOR#\#}"
  FILTER="[0:v]scale=1080:680:force_original_aspect_ratio=increase,crop=1080:680,setsar=1[bot];"
  FILTER+="color=c=$HEX:s=1080x400:r=30[top];"
  FILTER+="[top]drawtext=fontfile='$FONT_E':textfile='$PAGE_E':expansion=none:fontcolor=white:fontsize=32:x=60:y=40,"
  FILTER+="drawtext=fontfile='$FONT_E':textfile='$HEAD_E':expansion=none:fontcolor=white:fontsize=50:line_spacing=14:x=(w-text_w)/2:y=(h-text_h)/2+25:borderw=3:bordercolor=black@0.4[ban];"
  FILTER+="[ban][bot]vstack=inputs=2:shortest=1[v]"
  INPUTS=(-i "$INPUT")
fi

ffmpeg -hide_banner -loglevel error -y "${INPUTS[@]}" -filter_complex "$FILTER" \
  -map "[v]" -map "0:a?" -c:v libx264 -preset veryfast -crf 22 -c:a aac -b:a 128k -shortest "$OUTPUT"
echo "Rendered: $OUTPUT"
