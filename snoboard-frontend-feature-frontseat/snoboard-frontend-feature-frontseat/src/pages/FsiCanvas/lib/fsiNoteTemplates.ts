export type NoteTemplate = {
  key: string;
  label: string;
  body: string;
};

/** Quick notes for post IDs, metrics, URLs — separate from typed study nodes. */
export const NOTE_TEMPLATES: NoteTemplate[] = [
  { key: "post_id", label: "Post ID", body: "post_id: " },
  { key: "views", label: "Views", body: "-> views : " },
  { key: "likes", label: "Likes", body: "-> likes : " },
  { key: "url", label: "Post URL", body: "url: " },
  { key: "handle", label: "Account handle", body: "@ " },
  { key: "blank", label: "Blank note", body: "" },
];

export const NOTE_COLOR = "#f59e0b";
