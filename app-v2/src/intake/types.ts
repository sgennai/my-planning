// What /api/intake (server/intake.ts) hands the app, shared by both sides.

/** A bookmark as the app keeps it: Instapaper's fields, renamed, and nothing else. */
export interface SyncedBookmark {
  id: number;
  url: string | null;
  title: string | null;
  description: string | null;
  image: string | null;
  author: string | null;
  savedAt: number | null;
  publishedAt: number | null;
  archived: boolean;
  liked: boolean;
  folderId: number | null;
  tags: string[];
  category: number;
  /** Instapaper's own reading progress (0 to 1), from its apps: a hint, never the app's. */
  instapaperProgress: number;
  privateSource: string | null;
  /** The server's signature for `image`, so the reader may fetch it through /api/intake/image (Phase 2). */
  imageSig?: string | null;
}

export interface ParsedArticle {
  id: number;
  title: string | null;
  author: string | null;
  authorUrl: string | null;
  publishedAt: number | null;
  thumbnail: string | null;
  description: string | null;
  category: number;
  /** Instapaper's HTML, untrusted: sanitized by the app before it is shown. */
  html: string | null;
  images: string[];
  words: number | null;
  paywalled: boolean;
  direction: 'ltr' | 'rtl' | null;
  /** The server's signature for each picture address it may fetch for this article (Phase 2). */
  sigs?: Record<string, string>;
}
