/**
 * Schema.org JSON-LD builders. Pass the results as `jsonLd` on `c.render`.
 *
 * Only the types that fit any site live here. Add your own for what your
 * site genuinely is — `Organization` or `Person` for the owner,
 * `SoftwareApplication`, `Product`, `Article` — and only with facts the page
 * shows. Never add `aggregateRating` or `review` without real ones.
 * `.claude/skills/frugal/references/seo.md` has the table of which type fits
 * which page.
 */

import type { AppConfig } from "../config/app.config";

/** The site itself. Home page only — it describes the whole domain once. */
export const websiteSchema = (app: AppConfig) => ({
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": new URL("/#website", app.origin).toString(),
  name: app.name,
  url: new URL("/", app.origin).toString(),
  inLanguage: app.locale,
  ...(app.tagline ? { description: app.tagline } : {}),
});

/**
 * A page's visible question-and-answer list. Build it from the same array
 * the page renders, so the markup cannot disagree with the page. Google now
 * shows FAQ rich results only for a few government and health sites; other
 * engines still use it to understand the page.
 */
export const faqSchema = (faqs: { q: string; a: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    name: faq.q,
    acceptedAnswer: { "@type": "Answer", text: faq.a },
  })),
});
