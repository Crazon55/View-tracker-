export interface Page {
  id: string;
  handle: string;
  name: string | null;
  profile_url: string | null;
  profile_image_url: string | null;
  followers_count: number;
  stage: number;
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
  idea_id: string | null;
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
  idea_id: string | null;
  pages?: { handle: string; name: string | null };
}

export interface ContentStrategist {
  id: string;
  name: string;
  role: string | null;
  created_at: string;
}

export interface Idea {
  id: string;
  idea_number: number;
  idea_code: string;
  hook: string;
  cs_owner_id: string;
  format: string;
  source: string;
  status: string;
  notes: string | null;
  distributed_to: string[] | null;
  created_at: string;
  content_strategists?: { id: string; name: string };
  hook_variations?: string[];
  executor_name?: string;
  created_by?: string;
  yt_url?: string;
  timestamps?: string;
  base_drive_link?: string;
  pintu_batch_link?: string;
  comp_link?: string;
  deadline?: string;
}

export interface IdeaStat {
  id: string;
  idea_code: string;
  hook: string;
  format: string;
  source: string;
  status: string;
  cs_owner_id: string;
  cs_owner_name: string;
  cdi_owner_id: string;
  cdi_owner_name: string;
  distributed_to: string[] | null;
  created_at: string;
  total_posts: number;
  total_views: number;
  winners_count: number;
  hit_rate: number;
  best_post: { url: string; views: number; page_handle: string } | null;
  hook_variations: string[];
  executor_name: string;
  created_by: string;
  yt_url: string;
  timestamps: string;
  base_drive_link: string;
  pintu_batch_link: string;
  comp_link: string;
  deadline: string;
}

export interface CSStat {
  id: string;
  name: string;
  role: string | null;
  ideas_created: number;
  total_views: number;
  total_posts: number;
  winners_count: number;
  hit_rate: number;
}

export interface IdeaEngineData {
  system: {
    active_ideas: number;
    total_ideas: number;
    total_posts: number;
    total_views: number;
    total_winners: number;
    hit_rate: number;
    avg_views_per_idea: number;
    winner_threshold: number;
  };
  ideas: IdeaStat[];
  cs_leaderboard: CSStat[];
}
