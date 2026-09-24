-- Categories belong to a format as well as a stream.
--
-- A reel, a carousel and a static are researched and briefed differently, so the
-- categories that help on one are noise on another. With two streams that gives six
-- lists: BO/Reel, BO/Carousel, BO/Static, and the same three for HPN.
--
-- Note this is NOT the Reel-versus-Post split used for cadence counting, where Carousel
-- and Static both count as a post against an IP's floors. That split is about how many
-- things go out per day. This one is about what kind of thing it is. They happen to
-- share the word "format" and mean different questions.
--
-- Run this in the SQL editor of the FSOS project (qezjmcrzyqptfbaaaidm).

alter table categories
  add column if not exists format text not null default 'Carousel'
  check (format in ('Reel', 'Carousel', 'Static'));

-- The same name can now mean something different per format, so uniqueness includes it.
alter table categories drop constraint if exists categories_name_stream_key;
alter table categories
  add constraint categories_name_stream_format_key unique (name, stream, format);
