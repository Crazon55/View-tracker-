/**
 * URL Deduplication Utility
 * Extracts platform-specific post IDs from URLs to detect duplicates,
 * regardless of tracking parameters or URL variations.
 */

/**
 * Extract the unique post ID from a social media URL.
 * Returns the post ID if recognized, or the full URL as fallback.
 */
export function extractPostId(rawUrl: string): string {
  try {
    const url = new URL(rawUrl.trim());
    const hostname = url.hostname.replace(/^www\./, '');
    const path = url.pathname;

    // Instagram: /reel/POST_ID/ or /p/POST_ID/
    if (hostname === 'instagram.com') {
      const match = path.match(/\/(reel|p|tv)\/([A-Za-z0-9_-]+)/);
      if (match) return `instagram:${match[2]}`;
    }

    // YouTube: /shorts/VIDEO_ID, /watch?v=VIDEO_ID, or youtu.be/VIDEO_ID
    if (hostname === 'youtube.com' || hostname === 'm.youtube.com') {
      const shortsMatch = path.match(/\/shorts\/([A-Za-z0-9_-]+)/);
      if (shortsMatch) return `youtube:${shortsMatch[1]}`;
      const watchId = url.searchParams.get('v');
      if (watchId) return `youtube:${watchId}`;
    }
    if (hostname === 'youtu.be') {
      const id = path.slice(1).split('/')[0];
      if (id) return `youtube:${id}`;
    }

    // Twitter / X: /status/TWEET_ID or /i/status/TWEET_ID
    if (hostname === 'twitter.com' || hostname === 'x.com') {
      const match = path.match(/\/status\/(\d+)/);
      if (match) return `twitter:${match[1]}`;
    }

    // LinkedIn: /posts/ACTIVITY_ID or /feed/update/urn:li:activity:ID
    if (hostname === 'linkedin.com') {
      const postsMatch = path.match(/\/posts\/([A-Za-z0-9_-]+)/);
      if (postsMatch) return `linkedin:${postsMatch[1]}`;
      const activityMatch = path.match(/activity[:\-](\d+)/);
      if (activityMatch) return `linkedin:${activityMatch[1]}`;
    }

    // Fallback: use full URL without query params and hash
    return url.origin + url.pathname;
  } catch {
    return rawUrl.trim();
  }
}

/**
 * Deduplicate an array of URLs by comparing extracted post IDs.
 * Returns unique URLs (keeping the first occurrence), the duplicate count,
 * and the list of removed duplicate URLs.
 */
export function deduplicateUrls(urls: string[]): {
  unique: string[];
  duplicateCount: number;
  removedUrls: string[];
} {
  const seen = new Map<string, string>(); // postId -> first original URL
  const removedUrls: string[] = [];

  for (const url of urls) {
    const postId = extractPostId(url);
    if (!seen.has(postId)) {
      seen.set(postId, url);
    } else {
      removedUrls.push(url);
    }
  }

  const unique = Array.from(seen.values());
  return {
    unique,
    duplicateCount: urls.length - unique.length,
    removedUrls,
  };
}
