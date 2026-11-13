// Plain module (no "use client") so server components can import the string itself.
/**
 * Decides, before paint, whether the intro plays this session:
 *  - adds `js` on <html> (enables reveal pre-states)
 *  - sets html[data-intro] = "play" | "reduced" | "done" (always "done" for bots, for /{locale}/inactive, where a
 *    tap on a not-yet-activated chip or QR lands, and for the search landing pages /{locale}/guides/* and
 *    /{locale}/restaurants: those visitors get the content at once, not the brand intro — and the H1 is the LCP)
 *  - arms a failsafe so the page can never stay hidden if the JS bundle fails.
 */
export const INTRO_BOOT_SCRIPT = `(function(){var d=document.documentElement;d.classList.add('js');var s='done';try{var bot=/bot|crawl|spider|slurp|facebookexternalhit|embedly|preview/i.test(navigator.userAgent)||/\\/(inactive|restaurants|guides)(\\/|$)/.test(location.pathname);var seen=sessionStorage.getItem('onde-intro');var rm=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;if(!seen&&!bot){s=rm?'reduced':'play';}}catch(e){}d.setAttribute('data-intro',s);if(s!=='done'){window.__ondeIntroFailsafe=setTimeout(function(){if(d.getAttribute('data-intro')!=='done'){d.setAttribute('data-intro','done');}},7000);}})();`;
