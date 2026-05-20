// ─── Podcast Channels Config ─────────────────────────────────────────────────
// Edit this file to add/remove tracked channels or watched guests.
//
// How to find a YouTube channel ID:
//   1. Go to the channel's YouTube page
//   2. Right-click → View Page Source → search for "channelId" or "externalId"
//   OR use https://commentpicker.com/youtube-channel-id.php

export type PodcastChannel = {
  id: string;
  name: string;
  channelId: string;
  handle: string;
};

export const PODCAST_CHANNELS: PodcastChannel[] = [
  {
    id: "raj-shamani",
    name: "Figuring Out with Raj Shamani",
    channelId: "UCzwCEE_PchiBULMnAJqhGVg",
    handle: "@RajShamani",
  },
  {
    id: "prakhar-pravachan",
    name: "Prakhar Ke Pravachan",
    channelId: "UCHOKvQW2N4kLVhKYn2bvF7A",
    handle: "@PrakharKePravachan",
  },
  {
    id: "dostcast",
    name: "Dostcast",
    channelId: "UCpeRzRS1b1NvY4og1huE7jw",
    handle: "@Dostcast",
  },
  {
    id: "ranveer-show",
    name: "The Ranveer Show",
    channelId: "UCneyi-aYq4VIBYIAQgWmk_w",
    handle: "@BeerBiceps",
  },
  {
    id: "think-school",
    name: "Think School",
    channelId: "UCKZozRVHRYsYHGEyNKuhhdA",
    handle: "@ThinkSchool",
  },
  {
    id: "nikhil-kamath",
    name: "Nikhil Kamath Podcast",
    channelId: "UCnC8SAZzQiBGYVSKZ_S3y4Q",
    handle: "@NikhilKamath",
  },
];

// Guests whose names, when found in a title or description, trigger a Guest Alert.
// Names are matched case-insensitively. Add new names here freely.
export const GUEST_WATCHLIST: string[] = [
  "Aman Gupta",
  "Mukesh Ambani",
  "Nikhil Kamath",
  "Deepinder Goyal",
  "Ashneer Grover",
  "Ritesh Agarwal",
  "Vijay Shekhar Sharma",
  "Kunal Shah",
  "Peyush Bansal",
  "Namita Thapar",
  "Vineeta Singh",
  "Anupam Mittal",
  "Ratan Tata",
  "Nithin Kamath",
  "Varun Dua",
  "Harsh Jain",
  "Ghazal Alagh",
  "Bhavish Aggarwal",
  "Nandan Nilekani",
  "Sanjeev Bikhchandani",
];

/** Guest Alerts: only videos at least this long (full episodes, not shorts/clips). */
export const MIN_GUEST_ALERT_DURATION_SECONDS = 40 * 60;

/** Guest Alerts: max age of upload (freshness window). */
export const GUEST_ALERT_MAX_AGE_DAYS = 14;

/** “New Episodes” → Podcasts chip: only uploads newer than this. */
export const NEW_EPISODES_PODCAST_MAX_AGE_DAYS = 7;

/**
 * Extra lowercase phrases to match beyond the exact display name (YouTube titles often
 * abbreviate: first name only, no space, etc.). Only add distinctive tokens to limit false positives.
 */
export const GUEST_TITLE_ALIASES: Partial<Record<string, string[]>> = {
  "Aman Gupta": ["amangupta", "boAt", "boat "],
  "Mukesh Ambani": ["mukesh d."],
  "Nikhil Kamath": ["nikhil &"],
  "Deepinder Goyal": ["deepinder goyal", "deepinder"],
  "Ashneer Grover": ["ashneer grover", "ashneer"],
  "Ritesh Agarwal": ["ritesh agarwal", "ritesh &", "oyo"],
  "Vijay Shekhar Sharma": ["vijay shekhar", "vijay shekhar sharma", "vss"],
  "Kunal Shah": ["kunal shah", "kunal ("],
  "Peyush Bansal": ["peyush bansal", "peyush "],
  "Namita Thapar": ["namita thapar"],
  "Vineeta Singh": ["vineeta singh"],
  "Anupam Mittal": ["anupam mittal"],
  "Ratan Tata": ["ratan tata"],
  "Nithin Kamath": ["nithin kamath", "nithin "],
  "Varun Dua": ["varun dua", "acko"],
  "Harsh Jain": ["harsh jain", "dream11"],
  "Ghazal Alagh": ["ghazal alagh", "ghazal"],
  "Bhavish Aggarwal": ["bhavish aggarwal", "bhavish"],
  "Nandan Nilekani": ["nandan nilekani"],
  "Sanjeev Bikhchandani": ["sanjeev bikhchandani", "bikhchandani"],
};

/**
 * Return canonical watchlist names whose full name or aliases appear in title + description.
 */
export function matchGuestsInText(title: string, description: string): string[] {
  const hay = `${title} ${description}`.toLowerCase();
  const seen = new Set<string>();
  for (const name of GUEST_WATCHLIST) {
    if (seen.has(name)) continue;
    if (hay.includes(name.toLowerCase())) {
      seen.add(name);
      continue;
    }
    const aliases = GUEST_TITLE_ALIASES[name];
    if (!aliases) continue;
    if (aliases.some((a) => hay.includes(a.toLowerCase()))) seen.add(name);
  }
  return [...seen];
}

/**
 * Broad India tech / business brand tokens (lowercase). Used if no per-guest company hit.
 * Keeps alerts tied to notable companies, not random name drops.
 */
export const INDIAN_BRAND_KEYWORDS: string[] = [
  "zomato",
  "ola electric",
  "ola ",
  "oyo ",
  "paytm",
  "phonepe",
  "zerodha",
  "groww",
  "flipkart",
  "nykaa",
  "swiggy",
  "bharatpe",
  "cred ",
  "lenskart",
  "dream11",
  "mamaearth",
  "shark tank india",
  "shark tank",
  "reliance",
  "jio",
  "tata ",
  "tata group",
  "infosys",
  "info edge",
  "naukri",
];

/**
 * For each watchlisted guest, strings that should appear in title/description to tie them
 * to an Indian company or known business context (lowercase substrings).
 */
export const GUEST_COMPANY_TERMS: Partial<Record<string, string[]>> = {
  "Aman Gupta": ["boAt", "boat", "shark tank"],
  "Mukesh Ambani": ["reliance", "jio", "ril "],
  "Nikhil Kamath": ["zerodha", "true beacon"],
  "Deepinder Goyal": ["zomato"],
  "Ashneer Grover": ["bharatpe", "shark tank"],
  "Ritesh Agarwal": ["oyo"],
  "Vijay Shekhar Sharma": ["paytm", "vss"],
  "Kunal Shah": ["cred"],
  "Peyush Bansal": ["lenskart", "shark tank"],
  "Namita Thapar": ["emcure", "shark tank"],
  "Vineeta Singh": ["sugar cosmetic", "shark tank"],
  "Anupam Mittal": ["shaadi", "people group", "shark tank"],
  "Ratan Tata": ["tata"],
  "Nithin Kamath": ["zerodha"],
  "Varun Dua": ["acko"],
  "Harsh Jain": ["dream11", "dream 11"],
  "Ghazal Alagh": ["mamaearth", "shark tank"],
  "Bhavish Aggarwal": ["ola"],
  "Nandan Nilekani": ["aadhaar", "uidai", "infosys", "ekstep"],
  "Sanjeev Bikhchandani": ["naukri", "info edge"],
};

/** True when title/description anchors the episode to Indian business context. */
export function episodeHasIndianBrandContext(searchTextLower: string, matchedGuests: string[]): boolean {
  for (const g of matchedGuests) {
    const terms = GUEST_COMPANY_TERMS[g];
    if (terms?.some((t) => searchTextLower.includes(t.toLowerCase()))) return true;
  }
  return INDIAN_BRAND_KEYWORDS.some((k) => searchTextLower.includes(k.toLowerCase()));
}
