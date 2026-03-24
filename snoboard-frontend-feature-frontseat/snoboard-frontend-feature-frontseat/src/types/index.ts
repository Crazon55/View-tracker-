export interface Page {
  id: string;
  handle: string;
  name: string | null;
  profile_url: string | null;
  profile_image_url: string | null;
  followers_count: number;
  created_at: string;
}

export interface Post {
  id: string;
  page_id: string;
  url: string;
  expected_views: number;
  actual_views: number;
  posted_at: string | null;
  created_at: string;
  pages?: { handle: string; name: string | null };
}

export interface Reel {
  id: string;
  page_id: string;
  url: string;
  views: number;
  posted_at: string | null;
  auto_scrape: boolean;
  last_scraped_at: string | null;
  created_at: string;
  pages?: { handle: string; name: string | null };
}
