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
