/* ONDE Admin — service worker (registered by the admin with { scope: "/admin" }).
 *
 * Push notifications only: no fetch handler, nothing cached, the admin always loads from the network.
 *
 * Payload (see src/server/push.ts) — Declarative Web Push, which iOS/iPadOS/macOS 18.4+ display by themselves, and
 * which this worker displays everywhere else (older iOS, Chrome, Firefox, Edge):
 *   { "web_push": 8030,
 *     "notification": { "title", "body", "navigate": "<absolute URL in /admin>", "app_badge": n, "lang", "silent" },
 *     "app_badge": n, "data": { "kind": "order" | "test", "orderId"?: n } }
 *
 * Rule: every push MUST end in showNotification() — iOS revokes the subscription after a few silent pushes. So the
 * handler is one promise chain that always shows something, even for an empty or broken payload, and never skips
 * because an admin window is focused.
 */
"use strict";

var ADMIN_PATH = "/admin";
var FALLBACK_TITLE = "ONDE Admin";
var FALLBACK_BODY = "New activity — open the admin to see it.";

self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

/** Absolute same-origin URL inside /admin, or null. */
function adminUrl(raw) {
  if (typeof raw !== "string" || !raw) return null;
  try {
    var u = new URL(raw, self.location.origin);
    if (u.origin !== self.location.origin) return null;
    if (u.pathname !== ADMIN_PATH && u.pathname.indexOf(ADMIN_PATH + "/") !== 0) return null;
    return u.href;
  } catch {
    return null;
  }
}

function text(v, max) {
  return typeof v === "string" ? v.slice(0, max) : "";
}

/** Read the push message into { title, options, badge }; never throws. */
function parsePush(event) {
  var msg = null;
  try {
    msg = event.data ? JSON.parse(event.data.text()) : null;
  } catch {
    msg = null;
  }
  if (!msg || typeof msg !== "object") msg = {};
  var n = msg.notification && typeof msg.notification === "object" ? msg.notification : msg;
  var data = msg.data && typeof msg.data === "object" ? msg.data : {};

  var title = text(n.title, 200) || FALLBACK_TITLE;
  var body = text(n.body, 1000) || (n.title ? "" : FALLBACK_BODY);
  var url = adminUrl(n.navigate) || adminUrl(n.url) || adminUrl(data.url) || new URL(ADMIN_PATH, self.location.origin).href;

  var rawBadge = msg.app_badge !== undefined ? msg.app_badge : n.app_badge;
  var badge = rawBadge === undefined || rawBadge === null || rawBadge === "" ? null : Number(rawBadge);
  if (badge !== null && !(badge >= 0 && badge <= 1e9)) badge = null;

  var options = {
    body: body,
    lang: text(n.lang, 20) || "en",
    icon: "/admin-icons/icon-192.png",
    data: { url: url, kind: text(data.kind, 20), orderId: typeof data.orderId === "number" ? data.orderId : null },
  };
  if (typeof data.orderId === "number") options.tag = "order-" + data.orderId;
  return { title: title, options: options, badge: badge };
}

/** Set / clear the app icon badge; resolves even if unsupported, rejected or slow. */
function updateBadge(badge) {
  return new Promise(function (resolve) {
    var timer = setTimeout(resolve, 1500);
    var done = function () {
      clearTimeout(timer);
      resolve();
    };
    try {
      var nav = self.navigator;
      var p = null;
      if (badge === null || !nav) p = null;
      else if (badge > 0 && typeof nav.setAppBadge === "function") p = nav.setAppBadge(badge);
      else if (badge === 0 && typeof nav.clearAppBadge === "function") p = nav.clearAppBadge();
      if (p && typeof p.then === "function") p.then(done, done);
      else done();
    } catch {
      done();
    }
  });
}

self.addEventListener("push", function (event) {
  var parsed;
  try {
    parsed = parsePush(event);
  } catch {
    parsed = { title: FALLBACK_TITLE, options: { body: FALLBACK_BODY, data: { url: new URL(ADMIN_PATH, self.location.origin).href } }, badge: null };
  }
  var show = function () {
    return self.registration.showNotification(parsed.title, parsed.options);
  };
  event.waitUntil(
    updateBadge(parsed.badge)
      .then(show, show)
      .catch(function () {
        // Last resort: never leave a push without a visible notification.
        return self.registration.showNotification(FALLBACK_TITLE, { body: FALLBACK_BODY });
      }),
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var data = event.notification.data || {};
  // A notification this worker showed carries data.url. One the system showed by itself (Declarative Web Push,
  // iOS/macOS 18.4+) has no data, only `navigate` — use it so a tap still opens the order, not the dashboard.
  var url = adminUrl(data.url) || adminUrl(event.notification.navigate) || new URL(ADMIN_PATH, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      var client = null;
      for (var i = 0; i < list.length; i++) {
        if (adminUrl(list[i].url)) {
          client = list[i];
          break;
        }
      }
      if (!client) return self.clients.openWindow ? self.clients.openWindow(url) : undefined;
      return Promise.resolve()
        .then(function () {
          return client.focus();
        })
        .then(function (focused) {
          var c = focused || client;
          if (c.url === url) return c;
          if (typeof c.navigate !== "function") throw new Error("navigate unsupported");
          return c.navigate(url);
        })
        .then(function (navigated) {
          // navigate() resolves to null when the page could not be controlled (e.g. cross-origin redirect).
          if (!navigated && self.clients.openWindow) return self.clients.openWindow(url);
          return navigated;
        })
        .catch(function () {
          return self.clients.openWindow ? self.clients.openWindow(url) : undefined;
        });
    }),
  );
});
