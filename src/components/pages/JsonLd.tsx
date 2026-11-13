// <script type="application/ld+json"> for structured data (server component, no JS shipped).
// One script per call; pass an array to emit several blocks. Content is escaped by jsonLd() (no "<").
import { jsonLd } from "./seo";

export default function JsonLd({ data }: { data: unknown | unknown[] }) {
  const blocks = Array.isArray(data) ? data : [data];
  return (
    <>
      {blocks.map((block, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(block) }} />
      ))}
    </>
  );
}
