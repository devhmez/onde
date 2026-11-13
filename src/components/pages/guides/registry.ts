// The guide / landing pages: path (same English slug in FR and EN, like /fr/shop), share image and content dates.
// Pure: read by the page routes, the sitemap and the footer. Bump `modified` whenever a page's copy changes.
import type { GuideKey } from "../types";

export type GuideEntry = {
  key: GuideKey;
  /** Localized path without the locale prefix. */
  path: string;
  /** 1200 × 630 JPEG in /public/og. */
  og: string;
  /** Guides are articles (Article JSON-LD, og:type article); the restaurants page is a landing page. */
  article: boolean;
  published: string;
  modified: string;
};

export const GUIDES: Record<GuideKey, GuideEntry> = {
  reviewLink: {
    key: "reviewLink",
    path: "/guides/google-review-link",
    og: "/og/guide-google-review-link.jpg",
    article: true,
    published: "2026-10-14",
    modified: "2026-10-14",
  },
  moreReviews: {
    key: "moreReviews",
    path: "/guides/get-more-google-reviews",
    og: "/og/guide-more-google-reviews.jpg",
    article: true,
    published: "2026-10-14",
    modified: "2026-10-14",
  },
  restaurants: {
    key: "restaurants",
    path: "/restaurants",
    og: "/og/restaurants.jpg",
    article: false,
    published: "2026-10-14",
    modified: "2026-10-14",
  },
};

export const GUIDE_LIST: GuideEntry[] = [GUIDES.reviewLink, GUIDES.moreReviews, GUIDES.restaurants];
