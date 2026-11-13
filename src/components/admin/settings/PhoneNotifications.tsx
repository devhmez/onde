"use client";
// admin → Settings → "Phone notifications": native pop-up alerts for new orders (Web Push) on this device, plus the list
// of every registered device with test / remove. Lives inside the settings <form>: every button is type="button".
import { useCallback, useEffect, useRef, useState, type SVGProps } from "react";
import { removePushSubscriptionAction, sendTestPushAction } from "@/app/(admin)/admin/push-actions";
import type { PushDevice, PushResult } from "@/server/push";
import { fmtDateTime, fmtShortDate } from "../format";
import { currentSubscription, endpointFingerprint, friendlyError, isIOS, isIPad, pushSupport, registerAdminSw, requestPermission, type PushSupport } from "../push/client";
import { disableSubscription, enableSubscription, syncSubscription } from "../push/sync";
import { useToast } from "../toast";

type Mode =
  | { kind: "checking" }
  | { kind: Exclude<PushSupport, "ok"> }
  | { kind: "denied" }
  /** Not getting alerts. `granted`: no permission prompt will show. `problem`: why this device couldn't be registered. */
  | { kind: "off"; granted: boolean; problem: string | null }
  /** Subscribed in this browser AND registered on the server. */
  | { kind: "on"; endpoint: string; fp: string | null };

type Busy = null | "enable" | "off" | "test-this" | "test-all" | `remove-${number}`;

const ico = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
const IconBell = (p: SVGProps<SVGSVGElement>) => (<svg {...ico} {...p}><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>);
const IconBellOff = (p: SVGProps<SVGSVGElement>) => (<svg {...ico} {...p}><path d="M8.7 3A6 6 0 0 1 18 8c0 2.7.6 4.6 1.3 5.9M17 17H3s3-1 3-8c0-.9.2-1.8.6-2.6" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0M2 2l20 20" /></svg>);
const IconPhone = (p: SVGProps<SVGSVGElement>) => (<svg {...ico} {...p}><rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="M11 18.5h2" /></svg>);
const IconLaptop = (p: SVGProps<SVGSVGElement>) => (<svg {...ico} {...p}><rect x="4" y="4.5" width="16" height="11" rx="1.8" /><path d="M2 19.5h20" /></svg>);
const IconShare = (p: SVGProps<SVGSVGElement>) => (<svg {...ico} {...p}><path d="M12 3v12M8 7l4-4 4 4" /><path d="M7 10H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1" /></svg>);

const PROVIDERS: [RegExp, string][] = [
  [/push\.apple\.com$/, "Apple"],
  [/googleapis\.com$/, "Google"],
  [/mozilla\.com$/, "Mozilla"],
  [/windows\.com$/, "Microsoft"],
];
const provider = (host: string) => PROVIDERS.find(([re]) => re.test(host))?.[1] ?? host;
const isPhoneLabel = (label: string) => /iphone|ipad|android/i.test(label);

/** Push-service failure (e.g. "HTTP 403 · BadJwtToken") in plain words; the raw reason stays in brackets for support. */
function deliveryProblem(raw: string): string {
  if (/HTTP 40[03]/.test(raw)) return `The device refused our alert — open ONDE Admin on it and tap Enable again (${raw}).`;
  if (/HTTP 413/.test(raw)) return `The alert was too large (${raw}).`;
  if (/HTTP (429|5\d\d)|Network/.test(raw)) return `The push service didn’t answer; the next order will try again (${raw}).`;
  return raw;
}

/** What the browser says (the server side is checked by the caller). */
async function detect(): Promise<Mode> {
  const support = pushSupport();
  if (support !== "ok") return { kind: support };
  await registerAdminSw();
  if (Notification.permission === "denied") return { kind: "denied" };
  const granted = Notification.permission === "granted";
  const sub = granted ? await currentSubscription() : null;
  if (!sub) return { kind: "off", granted, problem: null };
  return { kind: "on", endpoint: sub.endpoint, fp: await endpointFingerprint(sub.endpoint) };
}

const NOT_REGISTERED = "This device isn’t registered for alerts yet.";

function ResultLine({ r }: { r: PushResult }) {
  if (r.outcome === "delivered") {
    return (
      <span className="pill on">
        <i />
        Test sent
      </span>
    );
  }
  if (r.outcome === "removed") {
    return (
      <span className="pill gray">
        <i />
        Expired — removed
      </span>
    );
  }
  return (
    <span className="pill off" title={r.error}>
      <i />
      Not delivered
    </span>
  );
}

export default function PhoneNotifications({
  vapidPublicKey,
  initialDevices,
  adminHost,
}: {
  vapidPublicKey: string;
  initialDevices: PushDevice[];
  /** "admin.onde.tn" — where the Home Screen app must be installed from (null in local development). */
  adminHost: string | null;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>({ kind: "checking" });
  const [devices, setDevices] = useState<PushDevice[]>(initialDevices);
  const [busy, setBusy] = useState<Busy>(null);
  const [results, setResults] = useState<Record<number, PushResult>>({});
  const [expired, setExpired] = useState<PushResult[]>([]);
  // Latest device list from the server and when it arrived (0 = the server-rendered list), read by refresh().
  const devicesRef = useRef(devices);
  const devicesAt = useRef(0);
  const applyDevices = useCallback((list: PushDevice[]) => {
    devicesRef.current = list;
    devicesAt.current = Date.now();
    setDevices(list);
  }, []);

  /**
   * Repair + read this device's state. A browser subscription the server doesn't have (expired → deleted, removed
   * from another device) is replaced by a fresh one (see push/sync.ts); "on" is shown only when the server has it.
   */
  const refresh = useCallback(async (): Promise<Mode> => {
    let problem: string | null = null;
    try {
      const r = await syncSubscription(vapidPublicKey, devicesRef.current.map((d) => d.fp), devicesAt.current);
      if (r.state !== "idle" && r.devices) applyDevices(r.devices);
      if (r.state === "error") problem = r.error;
    } catch (err) {
      problem = friendlyError(err);
    }
    const seen = await detect().catch((): Mode => ({ kind: "unsupported" }));
    let m = seen;
    if (seen.kind === "on" && seen.fp && !devicesRef.current.some((d) => d.fp === seen.fp)) m = { kind: "off", granted: true, problem: problem ?? NOT_REGISTERED };
    else if (seen.kind === "off") m = { ...seen, problem };
    setMode(m);
    return m;
  }, [vapidPublicKey, applyDevices]);

  useEffect(() => {
    let alive = true;
    const run = () => {
      if (alive) void refresh();
    };
    run();
    // Coming back from iPhone Settings (re-allowing notifications) → re-check.
    const onVisible = () => document.visibilityState === "visible" && run();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const thisFp = mode.kind === "on" ? mode.fp : null;
  const thisDevice = thisFp ? devices.find((d) => d.fp === thisFp) : undefined;
  const site = adminHost ?? (typeof window === "undefined" ? "this admin" : window.location.host);

  function enable() {
    // iOS only shows the permission prompt for a tap: ask FIRST, before anything is awaited.
    const permission = requestPermission();
    setBusy("enable");
    void (async () => {
      try {
        const p = await permission;
        if (p === "denied") {
          setMode({ kind: "denied" });
          toast.err("Notifications are blocked", "Allow them in your device settings — the steps are on this card.");
          return;
        }
        if (p !== "granted") {
          toast.info("Not turned on", "Tap “Allow” when your device asks.");
          return;
        }
        // Always a brand-new subscription: an old one the browser still holds may be dead at the push service.
        const res = await enableSubscription(vapidPublicKey);
        if (!res.ok) {
          setMode({ kind: "off", granted: true, problem: res.error });
          toast.err("Couldn’t turn on notifications", res.error);
          return;
        }
        applyDevices(res.devices);
        setMode({ kind: "on", endpoint: res.endpoint, fp: res.fp });
        toast.ok("Notifications are on", "Tap “Send test” to see one.");
      } catch (err) {
        const problem = friendlyError(err);
        setMode((m) => (m.kind === "off" ? { ...m, problem } : m));
        toast.err("Couldn’t turn on notifications", problem);
      } finally {
        setBusy(null);
      }
    })();
  }

  async function turnOff() {
    setBusy("off");
    try {
      const list = await disableSubscription(mode.kind === "on" ? mode.endpoint : null);
      if (list) applyDevices(list);
      setMode({ kind: "off", granted: Notification.permission === "granted", problem: null });
      toast.ok("Turned off on this device", "Your other devices still get alerts.");
    } catch (err) {
      toast.err("Couldn’t turn off notifications", friendlyError(err));
    } finally {
      setBusy(null);
    }
  }

  async function sendTest(id?: number) {
    setBusy(id === undefined ? "test-all" : "test-this");
    try {
      const res = await sendTestPushAction(id === undefined ? {} : { id });
      if (!res.ok) {
        toast.err("Test not sent", res.error);
        return;
      }
      const { results: list, devices: fresh } = res.data;
      applyDevices(fresh);
      setResults(Object.fromEntries(list.map((r) => [r.id, r])));
      const mine = thisDevice ? list.find((r) => r.id === thisDevice.id) : undefined;
      setExpired(list.filter((r) => r.outcome === "removed" && r !== mine));
      const sent = list.filter((r) => r.outcome === "delivered").length;
      const failed = list.filter((r) => r.outcome === "failed");
      if (mine?.outcome === "removed") {
        // The push service dropped THIS browser's subscription: replace it right away (no tap needed).
        const m = await refresh();
        if (m.kind === "on") toast.ok("Alerts renewed on this device", "Its old subscription had expired. Tap “Send test” again.");
        else toast.err("This device’s alerts had expired", "Tap “Enable notifications on this device” to turn them back on.");
        if (list.length === 1) return;
      }
      if (!list.length) toast.info("No device to test", "Turn notifications on on a device first.");
      else if (sent === list.length) toast.ok(sent === 1 ? "Test sent" : `Test sent to ${sent} devices`, "It should pop up within a few seconds.");
      else if (sent > 0) toast.info(`Sent to ${sent} of ${list.length} devices`, "Details are next to each device below.");
      else toast.err("Test not delivered", failed[0]?.error ?? "The device’s subscription has expired.");
    } catch (err) {
      toast.err("Test not sent", friendlyError(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove(d: PushDevice) {
    if (d.fp === thisFp) return turnOff();
    setBusy(`remove-${d.id}`);
    try {
      const res = await removePushSubscriptionAction({ id: d.id });
      if (!res.ok) toast.err("Not removed", res.error);
      else {
        applyDevices(res.data.devices);
        toast.ok(`${d.label} removed`, "It no longer gets order alerts.");
      }
    } catch (err) {
      toast.err("Not removed", friendlyError(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card pn">
      <h3>Phone notifications</h3>
      <div className="sub">A pop-up on your phone the second a website order comes in — even when the app is closed.</div>

      {mode.kind === "checking" ? (
        <div className="pn-state" aria-busy="true">
          <span className="pn-ico sk" />
          <div className="grow">
            <b>Checking this device…</b>
          </div>
        </div>
      ) : null}

      {mode.kind === "ios-install" ? (
        <>
          <p className="notice mt16">
            <span aria-hidden>ⓘ</span>
            <span>
              On {isIPad() ? "iPad" : "iPhone"}, alerts only work in the <b>ONDE Admin app</b> on your Home Screen. It takes a minute:
            </span>
          </p>
          <ol className="pn-steps">
            <li>
              <span>
                Open <b>{site}</b> in <b>Safari</b>.
              </span>
            </li>
            <li>
              <span>
                Tap the <b>Share</b> button <IconShare className="pn-inline" />{" "}
                {isIPad() ? "(top right)." : "at the bottom (on iOS 26, tap ••• first, then Share)."}
              </span>
            </li>
            <li>
              <span>
                Tap <b>Add to Home Screen</b>, then <b>Add</b>.
              </span>
            </li>
            <li>
              <span>
                Open <b>ONDE Admin</b> from your Home Screen and sign in (the app has its own sign-in).
              </span>
            </li>
            <li>
              <span>
                Come back to <b>Settings</b> and tap <b>Enable notifications</b>.
              </span>
            </li>
          </ol>
          <p className="hint mt12">Needs iOS 16.4 or later.</p>
        </>
      ) : null}

      {mode.kind === "ios-update" ? (
        <p className="notice warn mt16">
          <span aria-hidden>!</span>
          <span>
            This {isIPad() ? "iPad" : "iPhone"} is too old for app notifications. Update it in <b>Settings → General → Software Update</b> (iOS 16.4 or
            later), then open this page again.
          </span>
        </p>
      ) : null}

      {mode.kind === "insecure" ? (
        <p className="notice warn mt16">
          <span aria-hidden>!</span>
          <span>
            Notifications need a secure connection. Open <b>https://{adminHost ?? "your admin address"}</b> and turn them on there.
          </span>
        </p>
      ) : null}

      {mode.kind === "unsupported" ? (
        <p className="notice warn mt16">
          <span aria-hidden>!</span>
          <span>
            This browser can’t show notifications. Use the ONDE Admin app on your iPhone, or Safari, Chrome, Edge or Firefox on a computer.
          </span>
        </p>
      ) : null}

      {mode.kind === "denied" ? (
        <>
          <p className="notice warn mt16">
            <span aria-hidden>!</span>
            <span>
              <b>Notifications are blocked on this device.</b>{" "}
              {isIOS() ? (
                <>
                  Open the {isIPad() ? "iPad" : "iPhone"} <b>Settings</b> app → <b>Notifications</b> → <b>ONDE Admin</b> → turn on <b>Allow Notifications</b>.
                  Then come back here.
                </>
              ) : (
                <>
                  Click the icon at the left of the address bar → <b>Notifications</b> → <b>Allow</b> (Safari: <b>Safari → Settings → Websites → Notifications</b>
                  ). Then reload this page.
                </>
              )}
            </span>
          </p>
          <div className="pn-actions">
            <button type="button" className="btn sm" onClick={() => void refresh()}>
              I’ve allowed it — check again
            </button>
          </div>
        </>
      ) : null}

      {mode.kind === "off" ? (
        <>
          <div className="pn-state">
            <span className="pn-ico">
              <IconBellOff />
            </span>
            <div className="grow">
              <b>This device doesn’t get alerts yet</b>
              <span>
                {mode.granted
                  ? "Tap the button below to turn alerts on."
                  : `Your ${isIPad() ? "iPad" : isIOS() ? "iPhone" : "browser"} will ask for permission — tap “Allow”.`}
              </span>
            </div>
          </div>
          {mode.problem ? (
            <p className="notice warn pn-problem" role="status">
              <span aria-hidden>!</span>
              <span>
                {mode.problem === NOT_REGISTERED ? mode.problem : <>Couldn’t register this device: {mode.problem}</>}
                {/try again/i.test(mode.problem) ? null : ` Then ${isIOS() ? "tap" : "click"} the button to try again.`}
              </span>
            </p>
          ) : null}
          <button type="button" className="btn p pn-enable" onClick={enable} disabled={busy === "enable"}>
            <IconBell />
            {busy === "enable" ? "Turning on…" : "Enable notifications on this device"}
          </button>
        </>
      ) : null}

      {mode.kind === "on" ? (
        <>
          <div className="pn-state on">
            <span className="pn-ico">
              <IconBell />
            </span>
            <div className="grow">
              <b>This device gets order alerts</b>
              <span>
                {thisDevice?.lastSuccessAt ? `Last alert delivered ${fmtDateTime(thisDevice.lastSuccessAt)}.` : "You’ll get a pop-up for every new order."}
              </span>
            </div>
          </div>
          <div className="pn-actions">
            <button type="button" className="btn sm p" onClick={() => void sendTest(thisDevice?.id)} disabled={busy !== null || !thisDevice}>
              {busy === "test-this" ? "Sending…" : "Send test"}
            </button>
            <button type="button" className="btn sm danger" onClick={() => void turnOff()} disabled={busy !== null}>
              {busy === "off" ? "Turning off…" : "Turn off on this device"}
            </button>
          </div>
        </>
      ) : null}

      <hr className="divider" />
      <div className="row between">
        <span className="lbl" style={{ margin: 0 }}>
          Devices{devices.length ? ` · ${devices.length}` : ""}
        </span>
        {devices.length ? (
          <button type="button" className="linkbtn" onClick={() => void sendTest()} disabled={busy !== null}>
            {busy === "test-all" ? "Sending…" : "Send test to all devices"}
          </button>
        ) : null}
      </div>

      {devices.length === 0 ? (
        <p className="hint mt8">No device gets alerts yet. Turn them on from your iPhone first (ONDE Admin app → Settings).</p>
      ) : (
        <ul className="pn-list">
          {devices.map((d) => {
            const r = results[d.id];
            const mine = d.fp === thisFp;
            return (
              <li key={d.id} className="pn-dev">
                <span className="pn-dico">{isPhoneLabel(d.label) ? <IconPhone /> : <IconLaptop />}</span>
                <div className="pn-meta">
                  <b>
                    {d.label}
                    {mine ? (
                      <span className="pill vio">
                        <i />
                        This device
                      </span>
                    ) : null}
                    {r ? <ResultLine r={r} /> : null}
                  </b>
                  <small>
                    Added {fmtShortDate(d.createdAt)} · {d.lastSuccessAt ? `last alert ${fmtDateTime(d.lastSuccessAt)}` : "no alert delivered yet"} · via{" "}
                    {provider(d.host)}
                  </small>
                  {r?.outcome === "failed" && r.error ? (
                    <span className="err">Test failed: {deliveryProblem(r.error)}</span>
                  ) : d.lastError ? (
                    <span className="err">Last alert failed: {deliveryProblem(d.lastError)}</span>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="btn xs ghost danger"
                  onClick={() => void remove(d)}
                  disabled={busy !== null}
                  aria-label={`Remove ${d.label}`}
                >
                  {busy === `remove-${d.id}` ? "…" : "Remove"}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {expired.length ? (
        <p className="hint mt8">
          {expired.map((r) => r.label).join(", ")} {expired.length === 1 ? "was" : "were"} removed: the subscription had expired. Open ONDE Admin
          on {expired.length === 1 ? "it" : "each one"} once — if notifications are still allowed there, it signs back up by itself; otherwise tap
          Enable in its Settings.
        </p>
      ) : null}

      {devices.length ? (
        <p className="hint mt12">
          “Remove” stops alerts to a device. If that device opens ONDE Admin again with notifications allowed, it signs itself back up — to stop it
          for good, use “Turn off on this device” on it.
        </p>
      ) : null}
    </section>
  );
}
