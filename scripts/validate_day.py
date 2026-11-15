#!/usr/bin/env python3
"""Validate a dist/data/day-N.json lesson against the format used by Day 45-50.

Usage: python3 scripts/validate_day.py 51 [52 ...]
"""
import json
import re
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "dist" / "data"
QUIZ_LAYOUT = [("listening-1", 3), ("listening-2", 4), ("listening-3", 4),
               ("reading-triple-passage", 8), ("part-5", 15), ("part-6", 4)]


def check(n):
    errors = []
    err = errors.append
    path = DATA / f"day-{n}.json"
    try:
        d = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        return [f"{path.name}: cannot parse JSON: {e}"]

    for key in ["schemaVersion", "day", "title", "courseTitle", "targetScore", "minutes",
                "durationMinutes", "level", "source", "sections", "vocabulary", "quizzes",
                "keyTakeaway", "nextDay"]:
        if key not in d:
            err(f"missing top-level key: {key}")
    if d.get("day") != n:
        err(f"day field is {d.get('day')}, expected {n}")

    secs = d.get("sections", [])
    if len(secs) != 12:
        err(f"expected 12 sections, got {len(secs)}")
    titles = [s.get("title", "") for s in secs]
    if len(set(titles)) != len(titles):
        err("duplicate section titles")
    for i, s in enumerate(secs):
        if set(s) != {"title", "markdown"}:
            err(f"section {i} keys {sorted(s)}")
    listen = [s for s in secs if re.search(r"listening|聽力", s.get("title", ""), re.I)]
    if len(listen) != 3:
        err(f"expected 3 Listening sections, got {len(listen)}")
    for s in listen:
        if "聽力稿：" not in s["markdown"]:
            err(f"Listening section lacks 聽力稿： marker: {s['title']}")

    vocab = d.get("vocabulary", [])
    if len(vocab) != 30:
        err(f"expected 30 vocabulary items, got {len(vocab)}")
    for i, v in enumerate(vocab, 1):
        if v.get("id") != i or not all(v.get(k) for k in ("word", "meaning", "phrase")):
            err(f"vocabulary item {i} malformed: {v}")
    words = [v.get("word", "").lower() for v in vocab]
    if len(set(words)) != len(words):
        err("duplicate vocabulary words")

    quizzes = d.get("quizzes", [])
    layout = QUIZ_LAYOUT + [(f"day-{n}-quiz", 12)]
    got = [(q.get("id"), len(q.get("questions", []))) for q in quizzes]
    if got != layout:
        err(f"quiz layout {got} != {layout}")
    for q in quizzes:
        ids = [x.get("id") for x in q.get("questions", [])]
        if ids != list(range(1, len(ids) + 1)):
            err(f"{q.get('id')}: question ids not 1..n")
        for x in q.get("questions", []):
            opts = x.get("options", {})
            if list(opts) != ["A", "B", "C", "D"]:
                err(f"{q.get('id')} #{x.get('id')}: options must be A-D")
            if x.get("answer") not in opts:
                err(f"{q.get('id')} #{x.get('id')}: answer not in options")
            if not x.get("prompt") or not x.get("explanation"):
                err(f"{q.get('id')} #{x.get('id')}: missing prompt/explanation")
            if len(set(opts.values())) != len(opts):
                err(f"{q.get('id')} #{x.get('id')}: duplicate option text")
    answers = "".join(x["answer"] for q in quizzes for x in q.get("questions", []) if "answer" in x)
    for letter in "ABCD":
        share = answers.count(letter) / max(len(answers), 1)
        if share > 0.4:
            print(f"  ! warning: answer {letter} used for {share:.0%} of questions; spread answers more evenly")

    cur = json.loads((DATA / "curriculum.json").read_text(encoding="utf-8"))
    entry = next((c for c in cur if c["day"] == n), None)
    if not entry or not entry["available"] or entry["title"] != d.get("title"):
        err("curriculum.json entry not marked available with matching title")
    return errors


def main():
    days = [int(a) for a in sys.argv[1:]]
    if not days:
        print(__doc__)
        return 2
    bad = False
    for n in days:
        errs = check(n)
        print(f"Day {n}: {'OK' if not errs else 'FAIL'}")
        for e in errs:
            print("  -", e)
        bad |= bool(errs)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
