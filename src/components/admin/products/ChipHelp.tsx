// Short how-to shown with the stock list: write a chip with NFC Tools, test it, lock it, sell a stock link.
// The long version lives in docs/CHIPS.md.
export default function ChipHelp({ defaultOpen = false, inset = false }: { defaultOpen?: boolean; inset?: boolean }) {
  return (
    <details className={inset ? "help inset" : "card help"} open={defaultOpen}>
      <summary>
        <span>How to write a chip &amp; sell a stock link</span>
        <span className="caret" aria-hidden>
          ▾
        </span>
      </summary>
      <div className="help-grid">
        <section>
          <h4>1 · Write the chip (NFC Tools, free)</h4>
          <ol>
            <li>
              Open <b>NFC Tools</b> (iPhone or Android) → <b>Write</b> → <b>Add a record</b> → <b>URL / URI</b>.
            </li>
            <li>
              Paste the chip link <code>https://onde.tn/t/CODE</code> (copy button in the panel, or the chip sheet) — never the stand QR link that
              ends in <code>?s=qr</code>.
            </li>
            <li>
              <b>OK</b> → <b>Write</b> → hold the chip to the phone (top edge on iPhone, middle of the back on Android) until “Write complete”.
            </li>
            <li>
              In the stand’s panel, set <b>NFC chip → Written</b> (no paper chip sheet needed).
            </li>
          </ol>
        </section>
        <section>
          <h4>2 · Test, then lock</h4>
          <ol>
            <li>
              Close the app and tap the chip with a phone: a stock link opens the ONDE “not activated yet” page with its code; the tap appears
              here and the chip turns <b>Tested</b> by itself.
            </li>
            <li>Scan the printed QR too — it must show the same code.</li>
            <li>
              Optional, only after the test: NFC Tools → <b>Other</b> → <b>Lock tag</b>. It is <b>permanent</b>: the chip can never be rewritten
              (you still change the destination from here). Then set <b>NFC chip → Locked</b>.
            </li>
          </ol>
        </section>
        <section>
          <h4>3 · Sell a stock stand</h4>
          <ol>
            <li>
              Type the code printed under the QR in <b>Find a stand</b> (search on every page, magnifier on the iPhone) — or tap it in this list.
            </li>
            <li>
              <b>Sell this stand</b>: pick the client or <b>+ New client</b> (business, phone), paste their <b>Google review link</b>, keep{" "}
              <b>Paid in person</b> → <b>Sell</b>. Taps open their review form at once. Wrong stand? <b>Return to stock</b> undoes it.
            </li>
            <li>
              The client gets that link in <b>Google Business Profile</b> (search their business name on Google while signed in, or the Google Maps
              app → Business) → <b>Ask for reviews</b> / <b>Get more reviews</b> → <b>Copy link</b> (<code>g.page/r/…/review</code>).
            </li>
          </ol>
        </section>
      </div>
    </details>
  );
}
