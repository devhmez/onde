"use client";
// Mounted once in the authenticated admin shell. Invisible. On every app open it:
//   • registers /admin-sw.js (scope /admin) so pushes have somewhere to land;
//   • sets the app icon badge to the number of new orders (installed app; ignored elsewhere);
//   • when notifications are allowed (and not turned off on this device), checks this browser's subscription against
//     the devices the server has (`deviceFps`): none, unknown to the server (expired → deleted, or removed) or made with
//     another server key → subscribes afresh and saves it (no tap needed once permission is granted; WebKit never fires
//     pushsubscriptionchange). A known one is re-saved at most once a day. See ./sync.ts.
import { useEffect } from "react";
import { setBadge } from "./client";
import { syncSubscription } from "./sync";

export default function PushBootstrap({ newOrders, vapidPublicKey, deviceFps }: { newOrders: number; vapidPublicKey: string; deviceFps: string[] }) {
  useEffect(() => {
    setBadge(newOrders);
  }, [newOrders]);

  const fpsKey = deviceFps.join(",");
  useEffect(() => {
    void syncSubscription(vapidPublicKey, fpsKey ? fpsKey.split(",") : [], Date.now()).catch(() => {
      /* best effort — the Settings card shows the real state */
    });
  }, [vapidPublicKey, fpsKey]);

  return null;
}
