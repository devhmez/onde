// 8 · Offers — the three standing offers (free delivery · −10 % next order · cash on delivery) as animated cards.
import { Eyebrow } from "../Section";
import Reveal from "../Reveal";
import OfferCards, { type OfferCardsData } from "./OfferCards";
import type { HomeDict } from "../types";

type Props = { dict: HomeDict["offers"]; cards: OfferCardsData };

export default function Offers({ dict, cards }: Props) {
  return (
    <section id="offers" aria-labelledby="offers-title" className="relative overflow-x-clip bg-ink pb-[clamp(5rem,12vw,9rem)] pt-[clamp(4rem,9vw,7rem)]">
      <div className="container-site relative">
        <div className="mb-10 max-w-2xl md:mb-14">
          <Eyebrow>{dict.eyebrow}</Eyebrow>
          <Reveal as="h2" type="lines" id="offers-title" className="text-display mt-6 text-[clamp(2.2rem,5.4vw,4.6rem)] leading-[0.98]">
            {dict.title}
          </Reveal>
        </div>
        <OfferCards data={cards} />
      </div>
    </section>
  );
}
