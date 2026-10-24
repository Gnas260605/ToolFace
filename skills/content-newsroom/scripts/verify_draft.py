#!/usr/bin/env python3
"""Deterministic checks for an AI-written social post against its fact sheet and sources.

Ported and extended from ToolFace/NewsFlow's DeterministicVerifier.
Standard library only.

Usage:
  python3 verify_draft.py --facts fact_sheet.json --draft draft.json \
      [--sources src1.txt src2.txt ...] [--brand brand-profile.json]

Prints a JSON report. Exit code 0 = passed, 1 = blocking errors, 2 = bad input.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

# Clichés that make Vietnamese posts read as machine-written. Always blocked.
DEFAULT_AI_SLOP = [
    "trong thế giới ngày nay",
    "trong bối cảnh",
    "không thể phủ nhận rằng",
    "đó là minh chứng cho",
    "một bức tranh toàn cảnh",
    "hãy cùng chúng tôi điểm qua",
    "hãy cùng điểm qua",
    "không chỉ là",
    "một câu chuyện cảm động lòng người",
    "cuộc sống đôi khi mang đến",
    "tuyệt vời!",
    "chấn động!",
    "đáng chú ý!",
    "sốc!",
]

DEFAULT_POLICY = {
    "maximumSimilarityScore": 0.35,
    "similarityWarning": 0.20,
    "maximumQuoteWords": 25,
    "maxHeadlineChars": 90,
}

SPORTS_TYPES = {"RESULT", "MATCH_PREVIEW", "MATCH_RECAP"}
EMOJI_LIMITS = {"NONE": 0, "LOW": 3, "MODERATE": 8}

QUOTE_RE = re.compile(r'"([^"\n]+)"|“([^”\n]+)”|«([^»\n]+)»')
SCORE_RE = re.compile(r"(?<![\d/])(?<!\d\.)(\d{1,2})\s*[-–]\s*(\d{1,2})(?![\d/]|\.\d)")
NUMBER_RE = re.compile(r"\d+(?:[.,]\d+)*")
EMOJI_RE = re.compile(
    "[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F1E6-\U0001F1FF]"
)


def norm(text: str) -> str:
    text = unicodedata.normalize("NFC", text or "").lower()
    return re.sub(r"\s+", " ", text).strip()


def strip_punct(text: str) -> str:
    return re.sub(r"[^\w\s]", " ", norm(text))


def tokens(text: str) -> list[str]:
    return strip_punct(text).split()


def ngrams(text: str, n: int = 3) -> set[str]:
    t = tokens(text)
    return {" ".join(t[i : i + n]) for i in range(len(t) - n + 1)}


def canon_number(raw: str) -> str:
    """'1.200' / '1,200' -> '1200'; '3,5' / '3.5' -> '3.5'."""
    if re.fullmatch(r"\d{1,3}([.,]\d{3})+", raw):
        return re.sub(r"[.,]", "", raw)
    return raw.replace(",", ".")


def numbers_in(text: str) -> set[str]:
    return {canon_number(m) for m in NUMBER_RE.findall(text or "")}


def load_json(path: str) -> dict:
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"error": f"Cannot read {path}: {exc}"}, ensure_ascii=False))
        sys.exit(2)


def verify(facts: dict, draft: dict, sources: list[str], brand: dict) -> dict:
    policy = {**DEFAULT_POLICY, **(brand.get("editorialPolicy") or {})}
    errors: list[dict] = []
    warnings: list[dict] = []

    headline = draft.get("headline", "")
    parts = [headline, draft.get("hook", ""), draft.get("body", ""),
             draft.get("whyItMatters", ""), draft.get("discussionQuestion", "")]
    full_text = "\n".join(p for p in parts if p)
    full_norm = norm(full_text)
    sources_norm = [strip_punct(s) for s in sources]

    def err(code, message, evidence=None):
        errors.append({"code": code, "message": message, **({"evidence": evidence} if evidence else {})})

    def warn(code, message, evidence=None):
        warnings.append({"code": code, "message": message, **({"evidence": evidence} if evidence else {})})

    # 1. Scores — only for sports content, where "2-1" really is a score.
    fact_scores = facts.get("scores") or []
    if fact_scores or str(draft.get("contentType", "")).upper() in SPORTS_TYPES:
        known = set()
        for s in fact_scores:
            if s.get("homeScore") is not None and s.get("awayScore") is not None:
                known.add((int(s["homeScore"]), int(s["awayScore"])))
            for a, b in SCORE_RE.findall(s.get("rawText", "")):
                known.add((int(a), int(b)))
        for a, b in SCORE_RE.findall(full_text):
            pair = (int(a), int(b))
            if pair not in known and pair[::-1] not in known:
                err("SCORE_MISMATCH", f"Tỉ số {a}-{b} không có trong fact sheet.", f"{a}-{b}")

    # 2. Quotes — must exist in the fact sheet (or, at minimum, verbatim in a source).
    fact_quotes = [strip_punct(q.get("text", "")) for q in facts.get("quotes") or []]
    for m in QUOTE_RE.finditer(full_text):
        quote = next(g for g in m.groups() if g)
        if len(quote.split()) < 4:
            continue  # nicknames, short labels
        q = strip_punct(quote)
        in_facts = any(q in fq or fq in q for fq in fact_quotes if fq)
        in_sources = any(q in s for s in sources_norm)
        if not in_facts and not in_sources:
            err("FABRICATED_QUOTE", "Trích dẫn không có trong fact sheet hay nguồn.", quote)
        elif not in_facts:
            warn("QUOTE_NOT_IN_FACTS", "Trích dẫn có trong nguồn nhưng chưa được đưa vào fact sheet.", quote)
        if len(quote.split()) > policy["maximumQuoteWords"]:
            warn("QUOTE_TOO_LONG", f"Trích dẫn dài hơn {policy['maximumQuoteWords']} từ.", quote)

    # 3. Numbers — warn on figures that appear nowhere in facts or sources.
    allowed = numbers_in(json.dumps(facts, ensure_ascii=False))
    for s in sources:
        allowed |= numbers_in(s)
    hashtag_free = re.sub(r"#\S+", " ", full_text)
    for n in sorted(numbers_in(hashtag_free) - allowed):
        warn("NUMBER_NOT_IN_FACTS", f"Con số {n} không thấy trong fact sheet hay nguồn.", n)

    # 4. Forbidden phrases (brand list + default AI clichés).
    phrases = [p for p in (brand.get("forbiddenPhrases") or []) if p] + DEFAULT_AI_SLOP
    for p in dict.fromkeys(phrases):
        if norm(p) in full_norm:
            err("FORBIDDEN_PHRASE", f'Có cụm từ cấm: "{p}".', p)

    # 5. Similarity — share of the draft's word trigrams that also appear in a source.
    draft_grams = ngrams(full_text)
    similarity = 0.0
    if draft_grams:
        for s in sources:
            sim = len(draft_grams & ngrams(s)) / len(draft_grams)
            similarity = max(similarity, sim)
    pct = f"{similarity * 100:.0f}%"
    if similarity > policy["maximumSimilarityScore"]:
        err("SIMILARITY_TOO_HIGH",
            f"{pct} cụm 3 từ của bài trùng với nguồn (ngưỡng {policy['maximumSimilarityScore'] * 100:.0f}%). Viết lại bằng lời của mình.",
            pct)
    elif similarity > policy["similarityWarning"]:
        warn("SIMILARITY_WARNING", f"Độ trùng với nguồn {pct}, nên diễn đạt lại thêm.", pct)

    # 6. Attribution.
    if not (draft.get("attributionLine") or "").strip():
        err("ATTRIBUTION_REQUIRED", "Thiếu dòng ghi nguồn (attributionLine).")

    # 7. Presentation.
    if len(headline) > policy["maxHeadlineChars"]:
        warn("HEADLINE_TOO_LONG", f"Tiêu đề {len(headline)} ký tự, nên dưới {policy['maxHeadlineChars']}.")
    tags = draft.get("hashtags") or []
    rng = brand.get("hashtagCount") or {"min": 3, "max": 6}
    if not rng["min"] <= len(tags) <= rng["max"]:
        warn("HASHTAG_COUNT", f"Có {len(tags)} hashtag, nên {rng['min']}-{rng['max']}.")
    emoji_policy = str(brand.get("emojiPolicy", "LOW")).upper()
    emoji_count = len(EMOJI_RE.findall(full_text))
    if emoji_count > EMOJI_LIMITS.get(emoji_policy, 3):
        warn("EMOJI_POLICY", f"Có {emoji_count} emoji, vượt mức {emoji_policy}.")

    # 8. Unconfirmed info must be signalled.
    if (facts.get("uncertaintyFlags") or facts.get("conflicts")) and not re.search(
        r"chưa (được )?xác nhận|theo (thông tin|nguồn)|được cho là|chưa rõ|chưa có kết luận|unconfirmed|reportedly",
        full_norm,
    ):
        warn("UNCERTAINTY_NOT_SIGNALLED",
             "Fact sheet có thông tin chưa xác nhận/mâu thuẫn nhưng bài không nói rõ điều đó.")

    return {
        "passed": not errors,
        "blockingErrors": errors,
        "warnings": warnings,
        "similarityScore": round(similarity, 3),
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--facts", required=True)
    ap.add_argument("--draft", required=True)
    ap.add_argument("--sources", nargs="*", default=[])
    ap.add_argument("--brand")
    args = ap.parse_args()

    facts = load_json(args.facts)
    draft = load_json(args.draft)
    brand = load_json(args.brand) if args.brand else {}
    sources = []
    for p in args.sources:
        try:
            sources.append(Path(p).read_text(encoding="utf-8"))
        except OSError as exc:
            print(json.dumps({"error": f"Cannot read {p}: {exc}"}, ensure_ascii=False))
            sys.exit(2)

    report = verify(facts, draft, sources, brand)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    sys.exit(0 if report["passed"] else 1)


if __name__ == "__main__":
    main()
