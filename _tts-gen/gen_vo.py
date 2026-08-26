#!/usr/bin/env python3
"""Standalone real edge-tts generator, run on this machine (real internet
access) since the cloud sandbox authoring this project cannot reach
speech.platform.bing.com. Produces {hook,microservices,precision,cta}.mp3
+ captions.json, matching the AvalonLabs Remotion project's schema exactly."""
import argparse, asyncio, json
from dataclasses import dataclass
from pathlib import Path
import edge_tts

@dataclass
class SceneVO:
    id: str
    text: str
    target_s: float
    lead_in_s: float = 0.4
    tail_s: float = 0.4

SCENES = [
    SceneVO("hook", "Shipping production code shouldn't mean gambling with unoptimized queries "
            "and hidden security vulnerabilities.", target_s=7.0),
    SceneVO("microservices", "Meet AvalonLabs. Autonomous microservices designed to analyze, refactor, "
            "and secure your systems in seconds.", target_s=9.0),
    SceneVO("precision", "Built for modern engineering teams. Zero configuration, no mandatory "
            "sign-ups, and instant real-time diagnostics.", target_s=8.0),
    SceneVO("cta", "Optimize your stack today. Explore autonomous developer intelligence "
            "at avalonlabs-platform dot com.", target_s=6.0),
]

MIN_RATE_PCT, MAX_RATE_PCT = -20, 40


def merge_spoken_domain_suffix(words):
    tlds = {"com", "io", "ai", "dev", "net", "org"}
    merged, i = [], 0
    while i < len(words):
        w = words[i]
        bare = w["text"].strip(".,!?;:").lower()
        if bare == "dot" and i + 1 < len(words):
            nxt = words[i + 1]
            nxt_bare = nxt["text"].strip(".,!?;:").lower()
            if nxt_bare in tlds:
                merged.append({"text": f".{nxt_bare}", "startMs": w["startMs"], "endMs": nxt["endMs"]})
                i += 2
                continue
        merged.append(w)
        i += 1
    return merged


def duration_s(path: Path) -> float:
    from mutagen.mp3 import MP3
    return MP3(str(path)).info.length


async def synthesize(text: str, voice: str, rate_pct: int, mp3_path: Path) -> list:
    """One edge-tts pass -> mp3 + word-boundary events. rate/pitch match the
    brief's explicit --rate/--pitch settings; pitch stays fixed at +0Hz (only
    rate is adjusted to hit each scene's time budget)."""
    rate_str = f"{'+' if rate_pct >= 0 else ''}{rate_pct}%"
    communicate = edge_tts.Communicate(text, voice, rate=rate_str, pitch="+0Hz",
                                        boundary="WordBoundary")
    words = []
    with open(mp3_path, "wb") as f:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                start_ms = chunk["offset"] / 10_000
                dur_ms = chunk["duration"] / 10_000
                words.append({"text": chunk["text"], "start_ms": round(start_ms),
                              "end_ms": round(start_ms + dur_ms)})
    return words


async def generate_scene(scene: SceneVO, voice: str, out_dir: Path) -> dict:
    mp3_path = out_dir / f"{scene.id}.mp3"
    budget_s = scene.target_s - scene.lead_in_s - scene.tail_s

    rate_pct = 0
    words, actual_s = [], 0.0
    for attempt in range(3):
        words = await synthesize(scene.text, voice, rate_pct, mp3_path)
        actual_s = duration_s(mp3_path)
        ratio = actual_s / budget_s
        if 0.72 <= ratio <= 1.0:
            break
        target_ratio = 0.88
        needed_speed_multiplier = actual_s / (budget_s * target_ratio)
        new_rate_pct = round((needed_speed_multiplier - 1) * 100)
        rate_pct = max(MIN_RATE_PCT, min(MAX_RATE_PCT, new_rate_pct))
        if attempt == 2:
            print(f"  [{scene.id}] warning: {actual_s:.2f}s vs {budget_s:.2f}s budget "
                  f"after {attempt + 1} passes (rate capped at {rate_pct}%)")

    print(f"  [{scene.id}] {actual_s:.2f}s audio in a {budget_s:.2f}s budget (rate {rate_pct:+d}%)")
    return {
        "id": scene.id, "file": f"{scene.id}.mp3",
        "durationMs": round(actual_s * 1000), "leadInMs": round(scene.lead_in_s * 1000),
        "ratePct": rate_pct,
        "words": merge_spoken_domain_suffix(
            [{"text": w["text"], "startMs": w["start_ms"], "endMs": w["end_ms"]} for w in words]
        ),
    }


async def main(voice: str, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest = []
    for scene in SCENES:
        print(f"Generating '{scene.id}' with voice={voice} ...")
        manifest.append(await generate_scene(scene, voice, out_dir))
    manifest_path = out_dir / "captions.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(f"\nWrote {manifest_path}")
    print(f"Wrote {out_dir} / {{hook,microservices,precision,cta}}.mp3")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    # Mature, articulate, high-tech-founder-tone neural voice per the brief.
    # en-US-BrianNeural is the documented alternate if Andrew is unavailable.
    parser.add_argument("--voice", default="en-US-AndrewMultilingualNeural")
    parser.add_argument("--out-dir", default="./output")
    args = parser.parse_args()
    asyncio.run(main(args.voice, Path(args.out_dir)))
