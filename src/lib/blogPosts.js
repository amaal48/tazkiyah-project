// src/lib/blogPosts.js
//
// Lädt die Blogbeiträge aus content/blog/*.md beim Bauen (Vite, import.meta.glob) und wertet sie mit
// src/lib/blog.js aus. Dateien, die mit „_“ beginnen (z. B. _vorlage.md), erscheinen nicht.

import { postsFromFiles } from "./blog.js";

const files = import.meta.glob("/content/blog/*.md", { query: "?raw", import: "default", eager: true });

/** Alle Beiträge, neueste zuerst. */
export const POSTS = postsFromFiles(files);

export function postBySlug(slug) {
  return POSTS.find((p) => p.slug === slug) || null;
}
