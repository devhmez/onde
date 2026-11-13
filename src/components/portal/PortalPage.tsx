// The client page itself (server component): header, tap totals (a compact strip on phones), one card per product —
// where it leads and "Changer le lien" on the first screen — then the 30-day chart and the NFC/QR split.
// Only small islands are client components (chart hover, change-link dialog, location editor, pending note, the
// once-a-minute refresh). The same page is the owner's view of a client's dashboard: `actions` says who is looking
// (src/components/portal/PortalActions.tsx) and `banner` is the owner's sticky bar.
import Image from "next/image";
import type { ReactNode } from "react";
import Logo from "@/components/site/Logo";
import type { Locale } from "@/i18n/config";
import { KIND_IMAGE } from "../admin/meta";
import AutoRefresh from "./AutoRefresh";
import { ChangeLinkButton, ChangeLinkProvider, type ChangeStand } from "./ChangeLink";
import { fill, type PortalDict } from "./dict";
import { clockLabel, dayLabel, fmtNumber, longDayLabel, relTime, shortUrl } from "./format";
import { DestIcon, IconChat, IconExternal, IconLock } from "./icons";
import type { PortalStand, PortalView } from "./model";
import { PortalActionsProvider, type PortalActions } from "./PortalActions";
import { LocationEditor, PendingNote } from "./StandControls";
import TapsChart from "./TapsChart";

function productName(s: Pick<PortalStand, "kind" | "variant">, t: PortalDict): string {
  if (s.kind === "stand") return s.variant === "black" ? t.products.stand_black : s.variant === "white" ? t.products.stand_white : t.products.stand;
  return t.products[s.kind];
}

function productImage(s: Pick<PortalStand, "kind" | "variant">): string {
  return s.kind === "stand" && s.variant === "black" ? "/products/stand_black.webp" : KIND_IMAGE[s.kind];
}

const waLink = (digits: string, text: string) => `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;

/** How often the figures refresh while the page is visible (the "live" dot and "Chiffres à jour au …" are true). */
const REFRESH_MS = 60_000;

export default function PortalPage({
  view,
  t,
  locale,
  actions,
  banner,
}: {
  view: PortalView;
  t: PortalDict;
  locale: Locale;
  actions: PortalActions;
  banner?: ReactNode;
}) {
  const now = view.generatedAt;
  const n = (v: number) => fmtNumber(v, locale);
  const points = view.series.map((p) => ({ label: dayLabel(p.date, locale), long: longDayLabel(p.date, locale), value: p.taps }));
  const best = view.series.reduce<{ date: string; taps: number } | null>((b, p) => (p.taps > 0 && (!b || p.taps >= b.taps) ? p : b), null);
  const splitTotal = view.split.nfc + view.split.qr;
  const nfcPct = splitTotal ? Math.round((view.split.nfc / splitTotal) * 100) : 0;
  const qrPct = splitTotal ? 100 - nfcPct : 0;
  const taps = (v: number) => (v === 1 ? t.chart.tapOne : fill(t.chart.tapMany, { n: n(v) }));
  const pct = (v: number) => new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", { style: "percent", maximumFractionDigits: 0 }).format(v / 100);
  const changeStands: ChangeStand[] = view.stands.map((s) => ({ code: s.code, name: productName(s, t), destType: s.destType, destUrl: s.destUrl }));
  const locStrings = t.location;
  const noTapsYet = view.totals.all === 0;
  // Admin-only strings ("Vue admin : …", Valider / Refuser) are only sent in the owner's view, never in a client's page.
  const ownerView = actions.viewer === "owner";
  const help = view.whatsapp ? { href: waLink(view.whatsapp, fill(t.footer.waMessage, { business: view.business })), label: t.footer.whatsapp } : null;

  return (
    <PortalActionsProvider actions={actions}>
      <a href="#main" className="pt-skip">
        {t.header.skip}
      </a>
      {banner}
      <AutoRefresh everyMs={REFRESH_MS} />
      <div className="pt-glow" aria-hidden />
      <header className="pt-wrap pt-head">
        <div className="pt-top">
          <Logo className="pt-logo" title="ONDE" />
          {/* The owner's banner has its own FR / EN switch. */}
          {banner ? null : (
            <nav className="pt-lang" aria-label={t.header.lang}>
              <a href="?lang=fr" hrefLang="fr" lang="fr" aria-current={locale === "fr" ? "true" : undefined}>
                FR
              </a>
              <a href="?lang=en" hrefLang="en" lang="en" aria-current={locale === "en" ? "true" : undefined}>
                EN
              </a>
            </nav>
          )}
        </div>
        <p className="pt-eyebrow">{t.header.eyebrow}</p>
        <h1 className="pt-title">{view.business}</h1>
        <p className="pt-lead">{t.header.lead}</p>
      </header>

      <main id="main" className="pt-wrap pt-main" tabIndex={-1}>
        {noTapsYet ? (
          <section className="pt-welcome" aria-labelledby="pt-totals-h">
            <h2 id="pt-totals-h" className="pt-sr">
              {t.totals.title}
            </h2>
            <i className="pt-welcome-ic" aria-hidden />
            <p>{t.totals.welcome}</p>
          </section>
        ) : (
          <section className="pt-totals" aria-labelledby="pt-totals-h">
            <h2 id="pt-totals-h" className="pt-sr">
              {t.totals.title}
            </h2>
            {(
              [
                ["today", view.totals.today],
                ["d7", view.totals.d7],
                ["d30", view.totals.d30],
                ["all", view.totals.all],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className={`pt-tile${k === "today" ? " hi" : ""}`}>
                <span className="pt-tile-l">
                  {k === "today" ? <i className="pt-live" aria-hidden /> : null}
                  {t.totals[k]}
                </span>
                <b className={`pt-tile-v${n(v).length > 5 ? " long" : ""}`}>{n(v)}</b>
              </div>
            ))}
            <p className="pt-hint pt-totals-hint">{t.totals.hint}</p>
          </section>
        )}

        <section className="pt-stands" aria-labelledby="pt-stands-h">
          <div className="pt-sec-h">
            <h2 id="pt-stands-h">{t.stands.title}</h2>
            <span className="pt-count">{n(view.stands.length)}</span>
          </div>
          {view.stands.length === 0 ? (
            <p className="pt-card pt-empty">{t.stands.empty}</p>
          ) : (
            <ChangeLinkProvider
              mode={view.mode}
              changesLeft={view.changesLeft}
              stands={changeStands}
              help={help}
              t={{ change: t.change, choices: t.choices, types: t.types, errors: t.errors, owner: ownerView ? t.owner : undefined }}
            >
              <div className="pt-stand-list">
                {view.stands.map((s) => {
                  const name = productName(s, t);
                  return (
                    <article key={s.code} className={`pt-stand${s.active ? "" : " off"}`} aria-labelledby={`st-${s.code}`}>
                      <div className="pt-stand-top">
                        <div className="pt-thumb">
                          <Image src={productImage(s)} alt="" width={52} height={52} sizes="52px" />
                        </div>
                        <div className="pt-stand-id">
                          <h3 id={`st-${s.code}`}>{name}</h3>
                          <div className="pt-stand-meta">
                            <span className="pt-code" aria-label={fill(t.stands.code, { code: s.code })}>
                              {s.code}
                            </span>
                            <LocationEditor code={s.code} value={s.location} t={locStrings} />
                          </div>
                        </div>
                        <span className={`pt-status${s.active ? " on" : " off"}`}>
                          <i aria-hidden />
                          {s.active ? t.stands.active : t.stands.paused}
                        </span>
                      </div>

                      {s.active ? (
                        <div className="pt-dest">
                          <span className="pt-lbl">{t.stands.goesTo}</span>
                          <div className="pt-dest-row">
                            <DestIcon type={s.destType} size={40} unset={!s.destUrl} />
                            <div className="pt-dest-txt">
                              <b>{s.destUrl ? t.types[s.destType] : t.stands.notSet}</b>
                              {s.destUrl ? (
                                <span className="pt-url" title={s.destUrl}>
                                  {shortUrl(s.destUrl)}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="pt-inactive">
                          <IconLock width={16} height={16} />
                          <span>{t.stands.inactive}</span>
                        </p>
                      )}

                      <dl className="pt-stats">
                        <div>
                          <dt>{t.stands.taps30}</dt>
                          <dd>{n(s.taps30d)}</dd>
                        </div>
                        <div>
                          <dt>{t.stands.lastTap}</dt>
                          <dd>{s.lastTapAt ? relTime(s.lastTapAt, locale, now) : t.stands.never}</dd>
                        </div>
                      </dl>

                      {s.pending ? (
                        <PendingNote
                          code={s.code}
                          title={t.pending.title}
                          body={fill(t.pending.body, { type: t.types[s.pending.type] })}
                          url={shortUrl(s.pending.url)}
                          cancelLabel={t.pending.cancel}
                          approveLabel={ownerView ? t.owner.approve : undefined}
                          rejectLabel={ownerView ? t.owner.reject : undefined}
                          errorLabel={t.errors.failed}
                        />
                      ) : s.outcome ? (
                        <p className={`pt-outcome ${s.outcome.status}`} role="status">
                          {s.outcome.status === "approved" ? t.outcome.approved : fill(t.outcome.rejected, { type: t.types[s.outcome.type] })}
                        </p>
                      ) : null}

                      {s.active ? (
                        <div className="pt-actions">
                          <a className="pt-btn" href={`/t/${s.code}?s=test`} target="_blank" rel="noreferrer noopener" aria-label={fill(t.stands.testAria, { code: s.code })}>
                            {t.stands.test}
                            <IconExternal width={15} height={15} />
                          </a>
                          <ChangeLinkButton code={s.code} label={t.stands.change} ariaLabel={fill(t.stands.changeAria, { code: s.code })} />
                        </div>
                      ) : view.whatsapp ? (
                        <a
                          className="pt-btn pt-disabled"
                          href={waLink(view.whatsapp, `${fill(t.footer.waMessage, { business: view.business })} (${s.code})`)}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          <IconChat width={17} height={17} />
                          {t.stands.disabled}
                        </a>
                      ) : (
                        <p className="pt-disabled">{t.stands.disabledText}</p>
                      )}
                    </article>
                  );
                })}
              </div>
            </ChangeLinkProvider>
          )}
        </section>

        {/* No tap yet: the welcome line says it all (no empty chart, no empty split). */}
        {noTapsYet ? null : (
          <section className="pt-stats-sec" aria-labelledby="pt-stats-h">
            <div className="pt-sec-h">
              <h2 id="pt-stats-h">{t.stats.title}</h2>
            </div>
            <div className="pt-grid2">
              <section className="pt-card" aria-labelledby="pt-chart-h">
                <div className="pt-card-h">
                  <div>
                    <h3 id="pt-chart-h">{t.chart.title}</h3>
                    <p className="pt-sub">{t.chart.sub}</p>
                  </div>
                  {best ? (
                    <p className="pt-best">
                      <span>{t.chart.best}</span>
                      <b>{taps(best.taps)}</b>
                      <span>{dayLabel(best.date, locale)}</span>
                    </p>
                  ) : null}
                </div>
                {view.totals.d30 > 0 ? (
                  <>
                    <TapsChart
                      points={points}
                      ariaLabel={t.chart.aria}
                      tapOne={t.chart.tapOne}
                      tapMany={t.chart.tapMany}
                      todayLabel={t.chart.today}
                      numberLocale={locale === "fr" ? "fr-FR" : "en-US"}
                    />
                    <details className="pt-table">
                      <summary>{t.chart.table}</summary>
                      <div className="pt-table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th scope="col">{t.chart.colDate}</th>
                              <th scope="col" className="num">
                                {t.chart.colTaps}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...view.series].reverse().map((p) => (
                              <tr key={p.date}>
                                <td>{longDayLabel(p.date, locale)}</td>
                                <td className="num">{n(p.taps)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  </>
                ) : (
                  <p className="pt-empty">{t.chart.empty}</p>
                )}
              </section>

              <section className="pt-card pt-split-card" aria-labelledby="pt-split-h">
                <h3 id="pt-split-h">{t.split.title}</h3>
                <p className="pt-sub">{t.split.sub}</p>
                {splitTotal > 0 ? (
                  <>
                    <p className="pt-split-hero">
                      <b>{pct(nfcPct >= qrPct ? nfcPct : qrPct)}</b>
                      <span>{nfcPct >= qrPct ? t.split.hero : t.split.heroQr}</span>
                    </p>
                    <div className="pt-split-body">
                      <div className="pt-split" role="img" aria-label={`${t.split.aria} — ${t.split.nfc} ${pct(nfcPct)}, ${t.split.qr} ${pct(qrPct)}`}>
                        {view.split.nfc > 0 ? <i className="nfc" style={{ flexGrow: view.split.nfc }} /> : null}
                        {view.split.qr > 0 ? <i className="qr" style={{ flexGrow: view.split.qr }} /> : null}
                      </div>
                      <ul className="pt-legend">
                        <li>
                          <i className="nfc" aria-hidden />
                          <span>
                            <b>{t.split.nfc}</b> <small>{t.split.nfcHint}</small>
                          </span>
                          <b className="v">{n(view.split.nfc)}</b>
                          <span className="pc">{pct(nfcPct)}</span>
                        </li>
                        <li>
                          <i className="qr" aria-hidden />
                          <span>
                            <b>{t.split.qr}</b> <small>{t.split.qrHint}</small>
                          </span>
                          <b className="v">{n(view.split.qr)}</b>
                          <span className="pc">{pct(qrPct)}</span>
                        </li>
                      </ul>
                    </div>
                  </>
                ) : (
                  <p className="pt-empty">{t.split.empty}</p>
                )}
              </section>
            </div>
          </section>
        )}
      </main>

      <footer className="pt-wrap pt-foot">
        {view.whatsapp ? (
          <div className="pt-help">
            <span>{t.footer.help}</span>
            <a className="pt-btn wa" href={waLink(view.whatsapp, fill(t.footer.waMessage, { business: view.business }))} target="_blank" rel="noreferrer noopener">
              <IconChat width={17} height={17} />
              {t.footer.whatsapp}
            </a>
          </div>
        ) : null}
        <p className="pt-private">
          <IconLock width={15} height={15} />
          <span>{t.footer.private}</span>
        </p>
        <p className="pt-updated">{fill(t.footer.updated, { time: clockLabel(now, locale) })}</p>
        <p className="pt-brand">ONDE · onde.tn</p>
      </footer>
    </PortalActionsProvider>
  );
}
