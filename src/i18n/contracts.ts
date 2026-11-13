// Compile-time i18n contract (type-only, emits nothing): every message file of BOTH locales must satisfy the
// dictionary type its components read. A key missing in fr or en — or a string where a list is expected — fails
// `tsc` / `next build` instead of rendering `undefined` on the live site.
import type { CommonDict, HomeDict } from "@/components/site/types";
import type { ShopMessages } from "@/components/shop/messages";
import type { TapStoryDict } from "@/components/three/dict";
import type { AboutDict, ContactDict, GuidesDict, InactiveDict, LegalDict, SeoDict } from "@/components/pages/types";
import type frCommon from "../../messages/fr/common.json";
import type enCommon from "../../messages/en/common.json";
import type frHome from "../../messages/fr/home.json";
import type enHome from "../../messages/en/home.json";
import type enShop from "../../messages/en/shop.json";
import type enTapstory from "../../messages/en/tapstory.json";
import type enAbout from "../../messages/en/about.json";
import type enContact from "../../messages/en/contact.json";
import type enLegal from "../../messages/en/legal.json";
import type enInactive from "../../messages/en/inactive.json";
import type { PortalDict } from "@/components/portal/dict";
import type enPortal from "../../messages/en/portal.json";
import type frGuides from "../../messages/fr/guides.json";
import type enGuides from "../../messages/en/guides.json";
import type frSeo from "../../messages/fr/seo.json";
import type enSeo from "../../messages/en/seo.json";

/** Resolves to `true` only when T is assignable to Shape; otherwise the alias below is a type error. */
type Satisfies<T extends Shape, Shape> = T extends Shape ? true : never;

// Hand-written shapes (site): check both locales.
export type I18nContracts = [
  Satisfies<typeof frCommon, CommonDict>,
  Satisfies<typeof enCommon, CommonDict>,
  Satisfies<typeof frHome, HomeDict>,
  Satisfies<typeof enHome, HomeDict>,
  Satisfies<typeof frGuides, GuidesDict>,
  Satisfies<typeof enGuides, GuidesDict>,
  Satisfies<typeof frSeo, SeoDict>,
  Satisfies<typeof enSeo, SeoDict>,
  // Shapes derived from the fr file (`typeof fr`): the en file must match them.
  Satisfies<typeof enShop, ShopMessages>,
  Satisfies<typeof enTapstory, TapStoryDict>,
  Satisfies<typeof enAbout, AboutDict>,
  Satisfies<typeof enContact, ContactDict>,
  Satisfies<typeof enLegal, LegalDict>,
  Satisfies<typeof enInactive, InactiveDict>,
  Satisfies<typeof enPortal, PortalDict>,
];
