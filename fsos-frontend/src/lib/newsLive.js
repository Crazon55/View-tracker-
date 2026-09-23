// The News Feed's stories, fetched through the FSOS backend.
//
// This used to talk to Supabase from the browser and scrape Inshorts through the dev
// server's proxy — which meant it only worked under `craco start`, and not at all once
// RLS was locked down. Both sources now come from `GET /api/news/feed`: the articles
// the `fetch-news` edge function collects, and Inshorts read server-side.
//
// Votes and bookmarks aren't here — they're part of the workspace, so they go through
// the store's actions like everything else.
import { api } from "./api";

/** { items, status: { news, inshorts } } — a null count means that source failed. */
export function fetchLiveFeed() {
  return api.get("/api/news/feed");
}
