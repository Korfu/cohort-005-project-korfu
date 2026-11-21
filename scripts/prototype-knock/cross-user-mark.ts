// PROTOTYPE: can user B mark user A's message read by id? (B got 200 [] earlier)
import { knockKeys, knockUserId, signFeedToken } from "../../app/lib/knock-prototype.server";
const API = "https://api.knock.app/v1"; const A = 9002, B = 9003;
async function asUser(id: number, path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${knockKeys.publicKey}`, "X-Knock-User-Token": await signFeedToken(id), "Content-Type": "application/json" } });
  return { status: res.status, body: await res.json().catch(() => null) as any };
}
const feed = () => asUser(A, `/users/${knockUserId(A)}/feeds/${knockKeys.feedChannelId}`);
const f0 = await feed(); const ids = f0.body.entries.map((e: any) => e.id);
await asUser(A, `/messages/batch/unread`, { method: "POST", body: JSON.stringify({ message_ids: ids }) });
console.log("A after unread:", (await feed()).body.meta.unread_count);
const r = await asUser(B, `/messages/batch/read`, { method: "POST", body: JSON.stringify({ message_ids: ids }) });
console.log("B marks A's read ->", r.status, JSON.stringify(r.body));
console.log("A unread now (should be unchanged):", (await feed()).body.meta.unread_count);
