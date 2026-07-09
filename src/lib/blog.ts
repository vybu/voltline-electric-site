// Wix Blog (V3) read helpers — SSR, ambient auth (same pattern as lib/wix.ts).
// We import the modules and call them directly; there is no client / clientId.
import { posts, categories } from "@wix/blog";
import { media } from "@wix/sdk";

// Wix Blog app id — a platform constant.
export const BLOG_APP_ID = "14bcded7-0066-7c35-14d7-466cb3f09103";

export type PostView = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  coverUrl: string | null;
  categoryLabel: string | null;
  firstPublishedDate: string | null;
  minutesToRead: number;
};

export type PostDetail = PostView & {
  richContent: unknown;
  categoryLabels: string[];
};

// The posts are seeded text-only, so their CMS cover is empty. Fall back to the
// curated brand art shipped in /public/notes, keyed by the post's category — not
// stock filler, these are the illustrations made for exactly these articles. A
// real cover set in the dashboard (post.media) always wins.
const CATEGORY_IMAGE: Record<string, string> = {
  Safety: "/notes/safety-fuse-board.webp",
  EV: "/notes/ev-charger-guide.webp",
  Lighting: "/notes/lighting-led-flicker.webp",
  Landlords: "/notes/landlord-eicr-checklist.webp",
};

function resolveCover(post: any): string | null {
  const image = post?.media?.wixMedia?.image;
  if (image) {
    if (typeof image === "string" && image.startsWith("https://")) return image;
    if (typeof image?.url === "string" && image.url) return image.url;
    try {
      return media.getImageUrl(image).url;
    } catch {
      /* fall through to category art */
    }
  }
  return null;
}

// id -> label map for the blog's categories, fetched once per request.
let categoryMapPromise: Promise<Map<string, string>> | null = null;
function loadCategoryMap(): Promise<Map<string, string>> {
  if (!categoryMapPromise) {
    categoryMapPromise = (async () => {
      const map = new Map<string, string>();
      try {
        const { items } = await categories.queryCategories().find();
        for (const c of items ?? []) {
          const id = (c as any)._id ?? (c as any).id;
          if (id) map.set(id, (c as any).label ?? "");
        }
      } catch (e) {
        console.error("Failed to load blog categories", e);
      }
      return map;
    })();
  }
  return categoryMapPromise;
}

function toView(post: any, catMap: Map<string, string>): PostView {
  const catIds: string[] = post?.categoryIds ?? [];
  const categoryLabel = catIds.length ? catMap.get(catIds[0]) ?? null : null;
  return {
    id: post?._id ?? post?.id,
    slug: post?.slug ?? "",
    title: post?.title ?? "Untitled",
    excerpt: post?.excerpt ?? "",
    coverUrl: resolveCover(post) ?? (categoryLabel ? CATEGORY_IMAGE[categoryLabel] ?? null : null),
    categoryLabel,
    firstPublishedDate: post?.firstPublishedDate ?? null,
    minutesToRead: post?.minutesToRead ?? 0,
  };
}

/** Published posts, newest first (pinned lead). */
export async function listPosts(limit = 20): Promise<PostView[]> {
  const catMap = await loadCategoryMap();
  const { items } = await posts
    .queryPosts({ fieldsets: ["URL"] })
    .descending("firstPublishedDate")
    .limit(limit)
    .find();
  return (items ?? []).map((p: any) => toView(p, catMap)).filter((p) => p.slug);
}

/** One published post by slug, with full rich content — or null on a miss. */
export async function getPostBySlug(slug: string): Promise<PostDetail | null> {
  const catMap = await loadCategoryMap();
  const {
    items: [post],
  } = await posts
    .queryPosts({ fieldsets: ["RICH_CONTENT", "URL"] })
    .eq("slug", slug)
    .limit(1)
    .find();
  if (!post) return null;
  const view = toView(post, catMap);
  const catIds: string[] = (post as any).categoryIds ?? [];
  return {
    ...view,
    richContent: (post as any).richContent ?? null,
    categoryLabels: catIds.map((id) => catMap.get(id)).filter(Boolean) as string[],
  };
}

/** Long-form date, e.g. "9 July 2026". Falls back to empty string. */
export function formatPostDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}
