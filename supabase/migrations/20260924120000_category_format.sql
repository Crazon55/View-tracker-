-- Categories belong to a content type as well as a stream.
--
-- A BO reel and a BO carousel are not researched, briefed or judged the same way, so
-- the categories that make sense for one are noise on the other. Same for HPN. That
-- gives four buckets: BO/Reel, BO/Post, HPN/Reel, HPN/Post.
--
-- "Post" covers Carousel and Static together, which is the split the app already uses
-- everywhere else — see `formatCounts` in domain/constants.js, and the IP floors, which
-- count posts and reels rather than the three formats.
--
-- Existing rows become Post, since Carousel was the common case; anything that should be
-- Reel can be switched in Settings, or re-added.
--
-- Run this in the SQL editor of the FSOS project (qezjmcrzyqptfbaaaidm).

alter table categories
  add column if not exists format_group text not null default 'Post'
  check (format_group in ('Reel', 'Post'));

-- The same name can now mean something different for reels and for posts, so the
-- uniqueness rule has to include it.
alter table categories drop constraint if exists categories_name_stream_key;
alter table categories
  add constraint categories_name_stream_format_key unique (name, stream, format_group);
