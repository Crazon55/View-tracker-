"""YouTube podcast research for FSI AI — search, captions, Claude intel extract."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import anthropic
import requests

from app.config import get_settings

logger = logging.getLogger(__name__)

YT_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
YT_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos"
MAX_VIDEOS = 5
TRANSCRIPT_CHAR_LIMIT = 10_000
MODEL = "claude-haiku-4-5-20251001"

INTENT_RE = re.compile(
    r"(?i)\b("
    r"youtube|podcast|interview|podcasts|interviews|"
    r"research\b.*\b(about|on|for)|"
    r"find\b.*\b(podcast|interview|youtube)|"
    r"look\s*up\b.*\b(podcast|interview|youtube)|"
    r"what\s+(did|does|do)\b.+\b(say|said|talk)"
    r")\b"
)

EXTRACT_QUERY_RE = re.compile(
    r"(?is)(?:research|find|search|look\s*up|pull|scrape|get)\s+"
    r"(?:youtube\s+)?(?:podcasts?\s+)?(?:interviews?\s+)?"
    r"(?:about|for|on|regarding)\s+(.+?)(?:[.?!]|$)",
)


def _empty_pack(query: str = "", *, error: str | None = None, ran: bool = False) -> dict[str, Any]:
    pack: dict[str, Any] = {
        "ran": ran,
        "query": query or None,
        "video_count": 0,
        "videos": [],
        "overall": {
            "themes": [],
            "notable_quotes": [],
            "brands_across_podcasts": [],
        },
        "errors": [],
    }
    if error:
        pack["errors"].append(error)
    return pack


def detect_podcast_research_intent(message: str) -> dict[str, Any]:
    """Heuristic gate: whether to run YouTube research and which query to use."""
    text = (message or "").strip()
    if not text or not INTENT_RE.search(text):
        return {"should_research": False, "query": None}

    query = None
    m = EXTRACT_QUERY_RE.search(text)
    if m:
        query = m.group(1).strip(" \t\"'`")
        query = re.sub(r"\s+", " ", query).strip()
        # Drop trailing filler like "on YouTube"
        query = re.sub(r"(?i)\s+(on\s+youtube|from\s+youtube|podcasts?|interviews?)\s*$", "", query).strip()

    if not query:
        # "YouTube podcasts about X" / "podcasts about X"
        m2 = re.search(
            r"(?is)(?:youtube\s+)?(?:podcasts?|interviews?)\s+(?:about|for|on)\s+(.+?)(?:[.?!]|$)",
            text,
        )
        if m2:
            query = re.sub(r"\s+", " ", m2.group(1)).strip(" \t\"'`")

    if not query or len(query) < 2:
        # Last resort: strip the intent verbs and use the remainder
        cleaned = INTENT_RE.sub(" ", text)
        cleaned = re.sub(r"(?i)\b(about|for|on|regarding|please|can you|could you)\b", " ", cleaned)
        cleaned = re.sub(r"\s+", " ", cleaned).strip(" \t\"'`.,!?")
        query = cleaned if len(cleaned) >= 2 else None

    if not query:
        return {"should_research": False, "query": None}
    return {"should_research": True, "query": query[:200]}


async def refine_research_query(message: str) -> dict[str, Any] | None:
    """Optional Haiku refine when heuristics match but query is weak."""
    settings = get_settings()
    if not settings.anthropic_api_key:
        return None
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    try:
        response = await client.messages.create(
            model=MODEL,
            max_tokens=200,
            system=(
                "Extract whether the user wants YouTube/podcast research about a person or company. "
                'Reply ONLY with JSON: {"should_research": bool, "query": string|null}. '
                "query is the person or company name only."
            ),
            messages=[{"role": "user", "content": message.strip()}],
        )
        raw = response.content[0].text.strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```$", "", raw)
        data = json.loads(raw)
        if not isinstance(data, dict):
            return None
        return {
            "should_research": bool(data.get("should_research")),
            "query": (str(data["query"]).strip() if data.get("query") else None),
        }
    except Exception as e:
        logger.warning("refine_research_query failed: %s", e)
        return None


def search_podcast_videos(query: str, *, max_results: int = MAX_VIDEOS) -> list[dict[str, Any]]:
    settings = get_settings()
    if not settings.youtube_api_key:
        raise ValueError("YouTube API key not configured (YOUTUBE_API_KEY)")

    q = f"{query} podcast OR interview"
    params = {
        "part": "snippet",
        "q": q,
        "type": "video",
        "order": "relevance",
        "maxResults": max_results,
        "key": settings.youtube_api_key,
    }
    res = requests.get(YT_SEARCH_URL, params=params, timeout=30)
    if res.status_code != 200:
        raise RuntimeError(f"YouTube search failed ({res.status_code}): {res.text[:300]}")
    items = res.json().get("items") or []
    out = []
    for it in items:
        vid = (it.get("id") or {}).get("videoId")
        sn = it.get("snippet") or {}
        if not vid:
            continue
        out.append({
            "video_id": vid,
            "title": sn.get("title") or "",
            "channel": sn.get("channelTitle") or "",
            "published_at": sn.get("publishedAt") or "",
            "description": (sn.get("description") or "")[:500],
            "url": f"https://www.youtube.com/watch?v={vid}",
            "thumbnail": ((sn.get("thumbnails") or {}).get("medium") or {}).get("url")
            or ((sn.get("thumbnails") or {}).get("default") or {}).get("url"),
        })
    return out


def fetch_video_details(video_ids: list[str]) -> dict[str, dict[str, Any]]:
    if not video_ids:
        return {}
    settings = get_settings()
    params = {
        "part": "snippet,statistics",
        "id": ",".join(video_ids),
        "key": settings.youtube_api_key,
    }
    res = requests.get(YT_VIDEOS_URL, params=params, timeout=30)
    if res.status_code != 200:
        logger.warning("YouTube videos.list failed: %s", res.text[:300])
        return {}
    by_id: dict[str, dict[str, Any]] = {}
    for it in res.json().get("items") or []:
        vid = it.get("id")
        if not vid:
            continue
        sn = it.get("snippet") or {}
        st = it.get("statistics") or {}
        by_id[vid] = {
            "view_count": int(st.get("viewCount") or 0),
            "like_count": int(st.get("likeCount") or 0) if st.get("likeCount") is not None else None,
            "description": (sn.get("description") or "")[:2000],
            "channel": sn.get("channelTitle") or "",
            "published_at": sn.get("publishedAt") or "",
            "title": sn.get("title") or "",
        }
    return by_id


def fetch_transcript(video_id: str) -> tuple[str | None, str | None]:
    """Return (transcript_text, error). Prefer English captions."""
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
    except ImportError:
        return None, "youtube-transcript-api not installed"

    entries = None
    last_err: Exception | None = None

    # youtube-transcript-api 0.6.x class methods
    try:
        listing = YouTubeTranscriptApi.list_transcripts(video_id)
        try:
            transcript = listing.find_transcript(["en", "en-US", "en-GB"])
        except Exception:
            try:
                transcript = listing.find_generated_transcript(["en", "en-US", "en-GB"])
            except Exception:
                transcript = next(iter(listing))
        entries = transcript.fetch()
    except Exception as e:
        last_err = e

    # youtube-transcript-api 1.x instance API
    if entries is None:
        try:
            api = YouTubeTranscriptApi()
            if hasattr(api, "fetch"):
                fetched = api.fetch(video_id, languages=["en", "en-US", "en-GB"])
                entries = list(fetched)
            elif hasattr(api, "list"):
                listing = api.list(video_id)
                try:
                    t = listing.find_transcript(["en", "en-US", "en-GB"])
                except Exception:
                    t = next(iter(listing))
                entries = t.fetch()
        except Exception as e:
            last_err = e

    # Oldest get_transcript helper
    if entries is None:
        try:
            entries = YouTubeTranscriptApi.get_transcript(video_id, languages=["en", "en-US", "en-GB"])
        except Exception as e:
            last_err = e
            return None, f"No captions: {last_err}"

    parts: list[str] = []
    for row in entries:
        if isinstance(row, dict):
            parts.append(str(row.get("text") or ""))
        else:
            parts.append(str(getattr(row, "text", "") or ""))
    text = re.sub(r"\s+", " ", " ".join(parts)).strip()
    if not text:
        return None, "Empty captions"
    if len(text) > TRANSCRIPT_CHAR_LIMIT:
        text = text[:TRANSCRIPT_CHAR_LIMIT] + "…"
    return text, None


async def extract_intel(query: str, videos: list[dict[str, Any]]) -> dict[str, Any]:
    """Claude extracts quotes, brands, talking points from transcripts."""
    settings = get_settings()
    if not settings.anthropic_api_key:
        return {
            "videos": [],
            "overall": {"themes": [], "notable_quotes": [], "brands_across_podcasts": []},
            "errors": ["Anthropic API key not configured"],
        }

    compact = []
    for v in videos:
        compact.append({
            "video_id": v.get("video_id"),
            "title": v.get("title"),
            "channel": v.get("channel"),
            "url": v.get("url"),
            "published_at": v.get("published_at"),
            "view_count": v.get("view_count"),
            "has_transcript": bool(v.get("transcript")),
            "transcript_excerpt": (v.get("transcript") or "")[:TRANSCRIPT_CHAR_LIMIT],
            "transcript_error": v.get("transcript_error"),
        })

    prompt = (
        f"Subject of research: {query}\n\n"
        "From the podcast/interview videos and transcripts below, extract structured intel.\n"
        "Rules:\n"
        "- Only use content present in the transcripts/descriptions. Do not invent quotes.\n"
        "- If a video has no transcript, still note metadata but leave quotes empty.\n"
        "- brands_mentioned = company/product/brand names spoken about.\n"
        "- key_quotes = short verbatim-ish quotes (paraphrase lightly only if needed for clarity).\n"
        "Return ONLY JSON with this shape:\n"
        "{\n"
        '  "videos": [{\n'
        '    "video_id": str, "summary": str, "key_quotes": [str],\n'
        '    "brands_mentioned": [str], "talking_points": [str]\n'
        "  }],\n"
        '  "overall": {\n'
        '    "themes": [str], "notable_quotes": [str], "brands_across_podcasts": [str]\n'
        "  }\n"
        "}\n\n"
        f"VIDEOS_JSON:\n{json.dumps(compact, ensure_ascii=False)}"
    )

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    try:
        response = await client.messages.create(
            model=MODEL,
            max_tokens=4096,
            system="You are a research analyst. Output valid JSON only.",
            messages=[{"role": "user", "content": prompt}],
        )
        raw = response.content[0].text.strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```$", "", raw)
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise ValueError("Intel extract returned non-object")
        return {
            "videos": data.get("videos") or [],
            "overall": data.get("overall") or {
                "themes": [],
                "notable_quotes": [],
                "brands_across_podcasts": [],
            },
            "errors": [],
        }
    except Exception as e:
        logger.error("extract_intel failed: %s", e)
        return {
            "videos": [],
            "overall": {"themes": [], "notable_quotes": [], "brands_across_podcasts": []},
            "errors": [f"Intel extraction failed: {e}"],
        }


def _merge_intel_into_videos(
    videos: list[dict[str, Any]],
    intel_videos: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    by_id = {str(v.get("video_id")): v for v in intel_videos if v.get("video_id")}
    merged = []
    for v in videos:
        row = {
            "video_id": v.get("video_id"),
            "title": v.get("title"),
            "channel": v.get("channel"),
            "url": v.get("url"),
            "published_at": v.get("published_at"),
            "view_count": v.get("view_count"),
            "description": v.get("description"),
            "thumbnail": v.get("thumbnail"),
            "has_transcript": bool(v.get("transcript")),
            "transcript_error": v.get("transcript_error"),
            # Keep a short caption sample for Claude chat context
            "caption_sample": (v.get("transcript") or "")[:1500] or None,
            "summary": "",
            "key_quotes": [],
            "brands_mentioned": [],
            "talking_points": [],
        }
        intel = by_id.get(str(v.get("video_id"))) or {}
        row["summary"] = intel.get("summary") or ""
        row["key_quotes"] = intel.get("key_quotes") or []
        row["brands_mentioned"] = intel.get("brands_mentioned") or []
        row["talking_points"] = intel.get("talking_points") or []
        merged.append(row)
    return merged


async def research_podcasts(query: str) -> dict[str, Any]:
    """Orchestrate search → details → transcripts → intel extract."""
    q = (query or "").strip()
    if not q:
        return _empty_pack(error="Empty research query", ran=False)

    settings = get_settings()
    if not settings.youtube_api_key:
        return _empty_pack(q, error="YouTube API key not configured (set YOUTUBE_API_KEY)", ran=True)

    errors: list[str] = []
    try:
        videos = search_podcast_videos(q)
    except Exception as e:
        logger.exception("YouTube search failed")
        return _empty_pack(q, error=str(e), ran=True)

    if not videos:
        return _empty_pack(q, error="No YouTube podcast/interview videos found", ran=True)

    details = fetch_video_details([v["video_id"] for v in videos])
    for v in videos:
        d = details.get(v["video_id"]) or {}
        if d.get("title"):
            v["title"] = d["title"]
        if d.get("channel"):
            v["channel"] = d["channel"]
        if d.get("published_at"):
            v["published_at"] = d["published_at"]
        if d.get("description"):
            v["description"] = d["description"]
        v["view_count"] = d.get("view_count", 0)
        transcript, terr = fetch_transcript(v["video_id"])
        v["transcript"] = transcript
        v["transcript_error"] = terr
        if terr:
            errors.append(f"{v['video_id']}: {terr}")

    intel = await extract_intel(q, videos)
    errors.extend(intel.get("errors") or [])

    return {
        "ran": True,
        "query": q,
        "video_count": len(videos),
        "videos": _merge_intel_into_videos(videos, intel.get("videos") or []),
        "overall": intel.get("overall") or {
            "themes": [],
            "notable_quotes": [],
            "brands_across_podcasts": [],
        },
        "errors": errors,
    }


async def maybe_run_podcast_research(message: str) -> dict[str, Any]:
    """Intent gate + research for FSI chat."""
    gate = detect_podcast_research_intent(message)
    if not gate.get("should_research"):
        return _empty_pack(ran=False)

    query = gate.get("query")
    # If query looks like the whole message, try Haiku refine
    if not query or len(query) > 120 or query.lower() == message.strip().lower():
        refined = await refine_research_query(message)
        if refined and refined.get("should_research") and refined.get("query"):
            query = refined["query"]
        elif refined and not refined.get("should_research"):
            return _empty_pack(ran=False)

    if not query:
        return _empty_pack(ran=False)

    return await research_podcasts(query)
