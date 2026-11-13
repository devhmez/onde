// Idempotent seed, run on every server start:
// - catalog: the 7 launch products are inserted only while the products table is empty (first boot), so renaming a
//   slug or reshaping the catalog in admin → Catalog is never undone by a restart;
// - settings: any missing key gets its default; existing values are never overwritten.
// Descriptions are plain text; paragraphs are separated by a blank line ("\n\n").
import { count } from "drizzle-orm";
import { products, settings } from "./schema";
import type { DB } from "./index";
import { STAND_PROMO_ENDS_AT } from "../lib/sale";

type SeedProduct = Omit<typeof products.$inferInsert, "id" | "createdAt">;

const DT = 1000; // millimes

export const SEED_PRODUCTS: SeedProduct[] = [
  {
    slug: "stand-white",
    kind: "stand",
    nameEn: "Review Stand — White",
    nameFr: "Présentoir Avis — Blanc",
    taglineEn: "One tap. One more Google review.",
    taglineFr: "Un tap. Un avis Google de plus.",
    descEn:
      "Place it on the counter, by the register or on every table: your customers simply tap their phone on the stand and your Google review page opens instantly. No app, no searching for your business in Maps, no friction — just the stars. Phones without NFC scan the printed QR code instead.\n\n" +
      "Clear acrylic with a glossy white print: a clean, premium finish that suits cafés, restaurants, beauty salons, clinics and boutiques alike. The NFC chip carries your permanent ONDE smart link: if you ever want it to lead somewhere else — your Instagram, your menu, a seasonal offer — we update it remotely in seconds. The stand itself never needs replacing.\n\n" +
      "Works with iPhone and Android. Configured and tested before delivery, anywhere in Tunisia.\n\n" +
      "Size: 12 × 12 cm, 3 mm clear acrylic, L-shaped base.",
    descFr:
      "Posez-le sur le comptoir, près de la caisse ou sur chaque table : vos clients approchent leur téléphone du présentoir et votre page d'avis Google s'ouvre instantanément. Pas d'application, pas de recherche dans Maps, aucune friction — juste les étoiles. Les téléphones sans NFC scannent le QR code imprimé.\n\n" +
      "En acrylique transparent à impression blanche brillante, finition nette et premium, il trouve sa place dans un café, un restaurant, un salon de beauté, un cabinet ou une boutique. La puce NFC porte votre lien intelligent ONDE permanent : si un jour vous voulez qu'il mène ailleurs — votre Instagram, votre menu, une offre du moment — nous le modifions à distance en quelques secondes. Le présentoir, lui, ne se remplace jamais.\n\n" +
      "Compatible iPhone et Android. Configuré et testé avant la livraison, partout en Tunisie.\n\n" +
      "Format 12 × 12 cm, acrylique transparent 3 mm, socle en L.",
    price: 69 * DT,
    compareAt: null,
    salePrice: 59 * DT, // launch promo, 30 days
    saleEndsAt: STAND_PROMO_ENDS_AT,
    image: "/products/stand_white.webp",
    model: "/models/stand_white.glb",
    active: true,
    sort: 10,
  },
  {
    slug: "stand-black",
    kind: "stand",
    nameEn: "Review Stand — Black",
    nameFr: "Présentoir Avis — Noir",
    taglineEn: "Every happy customer becomes a review — in deep gloss black.",
    taglineFr: "Chaque client satisfait devient un avis — en noir profond.",
    descEn:
      "The same instant tap-to-review experience, dressed in deep gloss black for lounges, barbershops, cocktail bars and upscale restaurants. One tap opens your Google review page straight away; the printed QR code covers phones without NFC.\n\n" +
      "It looks at home next to a POS terminal or a candle-lit table and quietly reminds every guest that their opinion matters — at the exact moment they are happiest with you. Your permanent ONDE smart link means the destination can change at any time without touching the stand: reviews today, your Instagram tomorrow.\n\n" +
      "Works with iPhone and Android. Configured and tested before delivery, anywhere in Tunisia.\n\n" +
      "Size: 12 × 12 cm, 3 mm clear acrylic, L-shaped base.",
    descFr:
      "La même expérience « un tap, un avis », habillée de noir brillant pour les lounges, barbershops, bars à cocktails et restaurants haut de gamme. Un tap ouvre directement votre page d'avis Google ; le QR code imprimé prend le relais pour les téléphones sans NFC.\n\n" +
      "Il s'accorde avec un terminal de paiement comme avec une table tamisée, et rappelle discrètement à chaque client que son avis compte — au moment précis où il est le plus satisfait. Votre lien intelligent ONDE est permanent : la destination peut changer à tout moment sans toucher au présentoir. Des avis aujourd'hui, votre Instagram demain.\n\n" +
      "Compatible iPhone et Android. Configuré et testé avant la livraison, partout en Tunisie.\n\n" +
      "Format 12 × 12 cm, acrylique transparent 3 mm, socle en L.",
    price: 69 * DT,
    compareAt: null,
    salePrice: 59 * DT, // launch promo, 30 days
    saleEndsAt: STAND_PROMO_ENDS_AT,
    image: "/products/stand_black.webp",
    model: "/models/stand_black.glb",
    active: true,
    sort: 20,
  },
  {
    slug: "card",
    kind: "card",
    nameEn: "NFC Smart Card",
    nameFr: "Carte NFC",
    taglineEn: "The business card that never runs out.",
    taglineFr: "La carte de visite qui ne s'épuise jamais.",
    descEn:
      "Tap the card on any phone and share what matters in a second: your contact details, WhatsApp, Instagram, portfolio, website or your Google review page. No app to install, nothing to type, no paper card lost at the bottom of a bag.\n\n" +
      "Matte black, wallet-sized and built to last, it is perfect for freelancers, sales teams, real-estate agents — and for waiters who collect Google reviews right at the table. Because it carries a permanent ONDE smart link, you never reprint it: changed your number or launched a new page? Send us a message and the card points to the new destination instantly.\n\n" +
      "Works with iPhone and Android.",
    descFr:
      "Approchez la carte d'un téléphone et partagez l'essentiel en une seconde : vos coordonnées, WhatsApp, Instagram, portfolio, site web ou votre page d'avis Google. Aucune application à installer, rien à taper, plus de carte papier perdue au fond d'un sac.\n\n" +
      "Noir mat, format portefeuille et conçue pour durer, elle est idéale pour les freelances, les commerciaux, les agents immobiliers — et pour les serveurs qui récoltent des avis Google directement à table. Grâce à son lien intelligent ONDE permanent, vous ne la réimprimez jamais : nouveau numéro, nouvelle page ? Un message suffit et la carte mène instantanément à la nouvelle destination.\n\n" +
      "Compatible iPhone et Android.",
    price: 39 * DT,
    compareAt: null,
    image: "/products/card.webp",
    model: "/models/card.glb",
    active: true,
    sort: 30,
  },
  {
    slug: "keychain",
    kind: "keychain",
    nameEn: "NFC Keychain",
    nameFr: "Porte-clés NFC",
    taglineEn: "Always on you. Always ready to share.",
    taglineFr: "Toujours sur vous. Toujours prêt à partager.",
    descEn:
      "Your link travels with your keys. One tap on a client's phone opens your Google review page, your Instagram, your WhatsApp or your contact card — wherever you are.\n\n" +
      "Light, durable and pocket-friendly, the ONDE keychain is made for people on the move: delivery riders, drivers, technicians, coaches, event staff. It carries a permanent smart link, so the destination can be updated remotely at any time while the keychain stays exactly the same.\n\n" +
      "Works with iPhone and Android.",
    descFr:
      "Votre lien voyage avec vos clés. Un tap sur le téléphone d'un client ouvre votre page d'avis Google, votre Instagram, votre WhatsApp ou votre fiche contact — où que vous soyez.\n\n" +
      "Léger, résistant et facile à emporter, le porte-clés ONDE est pensé pour ceux qui bougent : livreurs, chauffeurs, techniciens, coachs, équipes événementielles. Il porte un lien intelligent permanent : la destination se met à jour à distance à tout moment, le porte-clés reste le même.\n\n" +
      "Compatible iPhone et Android.",
    price: 29 * DT,
    compareAt: null,
    image: "/products/keychain.webp",
    model: "/models/keychain.glb",
    active: true,
    sort: 40,
  },
  {
    slug: "sticker",
    kind: "sticker",
    nameEn: "NFC Sticker",
    nameFr: "Sticker NFC",
    taglineEn: "Make any surface tappable.",
    taglineFr: "Rendez n'importe quelle surface interactive.",
    descEn:
      "Stick it on a table, a menu, a shop window, a cash register or your packaging, and every surface becomes a doorway: one tap opens your Google review page, your menu, your Instagram or your website.\n\n" +
      "Discreet, thin and strongly adhesive, the ONDE sticker is the most affordable way to put your smart link everywhere your customers are. Like every ONDE product it carries a permanent link that we can redirect remotely whenever you need — no need to replace it.\n\n" +
      "Works with iPhone and Android.",
    descFr:
      "Collez-le sur une table, un menu, une vitrine, une caisse ou vos emballages, et chaque surface devient une porte d'entrée : un tap ouvre votre page d'avis Google, votre menu, votre Instagram ou votre site.\n\n" +
      "Discret, fin et très adhésif, le sticker ONDE est la façon la plus abordable de placer votre lien intelligent partout où se trouvent vos clients. Comme tous les produits ONDE, il porte un lien permanent que nous redirigeons à distance dès que vous en avez besoin — inutile de le remplacer.\n\n" +
      "Compatible iPhone et Android.",
    price: 19 * DT,
    compareAt: null,
    image: "/products/sticker.webp",
    model: "/models/sticker.glb",
    active: true,
    sort: 50,
  },
  {
    slug: "pack-cafe",
    kind: "pack",
    nameEn: "Café Pack",
    nameFr: "Pack Café",
    taglineEn: "2 review stands + 4 NFC stickers — your whole venue, covered.",
    taglineFr: "2 présentoirs avis + 4 stickers NFC — tout votre établissement, couvert.",
    descEn:
      "Everything a café or restaurant needs to collect reviews every single day: two review stands for the counter and the terrace, plus four NFC stickers for tables, menus or the register. Every guest is one tap away from your Google review page, wherever they sit.\n\n" +
      "Choose white or black stands — just tell us your preference in the order notes. Each piece carries its own permanent ONDE smart link, configured and tested before delivery, so you can start collecting reviews the day it arrives.\n\n" +
      "Works with iPhone and Android. All at a pack price.",
    descFr:
      "Tout ce qu'il faut à un café ou un restaurant pour récolter des avis chaque jour : deux présentoirs pour le comptoir et la terrasse, et quatre stickers NFC pour les tables, les menus ou la caisse. Chaque client est à un tap de votre page d'avis Google, où qu'il soit assis.\n\n" +
      "Présentoirs blancs ou noirs : indiquez simplement votre préférence dans les notes de commande. Chaque pièce porte son propre lien intelligent ONDE permanent, configuré et testé avant la livraison — vous commencez à récolter des avis dès le jour de réception.\n\n" +
      "Compatible iPhone et Android. Le tout à prix pack.",
    price: 149 * DT,
    compareAt: 194 * DT,
    image: "/products/stand_white.webp",
    model: "/models/stand_white.glb",
    active: true,
    sort: 60,
  },
  {
    slug: "pack-team",
    kind: "pack",
    nameEn: "Team Pack",
    nameFr: "Pack Équipe",
    taglineEn: "5 NFC smart cards — one for every member of your team.",
    taglineFr: "5 cartes NFC — une pour chaque membre de votre équipe.",
    descEn:
      "Equip your whole team in one go. Servers collect Google reviews at the table, sales reps share their contact in a tap, front-desk staff send guests straight to your Instagram.\n\n" +
      "Each card carries its own permanent ONDE smart link: point all five to your Google review page, or give every team member their own destination. When someone joins or leaves, we simply redirect their card — no reprinting, ever.\n\n" +
      "Works with iPhone and Android. All at a pack price.",
    descFr:
      "Équipez toute votre équipe d'un coup. Les serveurs récoltent des avis Google à table, les commerciaux partagent leur contact d'un tap, l'accueil envoie les clients directement sur votre Instagram.\n\n" +
      "Chaque carte porte son propre lien intelligent ONDE permanent : dirigez les cinq vers votre page d'avis Google, ou donnez à chacun sa propre destination. Quand quelqu'un arrive ou part, nous redirigeons simplement sa carte — sans jamais réimprimer.\n\n" +
      "Compatible iPhone et Android. Le tout à prix pack.",
    price: 159 * DT,
    compareAt: 195 * DT,
    image: "/products/card.webp",
    model: "/models/card.glb",
    active: true,
    sort: 70,
  },
];

/** Default settings (all values are strings in the DB; money in millimes). */
export const DEFAULT_SETTINGS: Record<string, string> = {
  deliveryFee: "7000",
  freeDeliveryThreshold: "99000",
  returningDiscountPct: "10",
  phone: "25875529",
  whatsapp: "21625875529",
  email: "",
  instagram: "",
  facebook: "",
  tiktok: "",
  legalName: "",
  taxId: "",
  address: "",
  storeOpen: "true",
};

export type SeedResult = { productsInserted: number; settingsInserted: number };

export function seedDatabase(db: DB): SeedResult {
  return db.transaction((tx) => {
    const now = Date.now();
    let productsInserted = 0;
    let settingsInserted = 0;
    const existing = tx.select({ n: count() }).from(products).get()?.n ?? 0;
    if (existing === 0) {
      for (const p of SEED_PRODUCTS) {
        const r = tx.insert(products).values({ ...p, createdAt: now }).onConflictDoNothing({ target: products.slug }).run();
        productsInserted += r.changes;
      }
    }
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      const r = tx.insert(settings).values({ key, value }).onConflictDoNothing({ target: settings.key }).run();
      settingsInserted += r.changes;
    }
    return { productsInserted, settingsInserted };
  });
}
