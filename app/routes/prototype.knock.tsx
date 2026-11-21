// PROTOTYPE (throwaway) — "Does Knock hold up against Cadence?" (#25).
// Branch prototype/knock-spike only. Never merge.
//
// The server signs a Knock user token for whoever the DevUI switcher selected;
// everything feed-related below is called from the BROWSER with only the public
// key + that token, so the checks exercise the real client-side auth path.
import { useCallback, useEffect, useState } from "react";
import { data, useFetcher } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/prototype.knock";
import { getCurrentUserId } from "~/lib/session";
import { db } from "~/db";
import { users } from "~/db/schema";
import {
  CATEGORY,
  ensureDefaultPreferences,
  identify,
  knockKeys,
  knockUserId,
  notifyDiscussionReply,
  notifyNewEnrollment,
  signFeedToken,
} from "~/lib/knock-prototype.server";

const KNOCK_API = "https://api.knock.app/v1";
const IN_APP_FEED = "in_app_feed";
const PREFERENCE_SET = "default";

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await getCurrentUserId(request);
  if (!userId) throw data("Select a user from the DevUI panel", { status: 401 });
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) throw data("User not found", { status: 404 });

  await identify(user);
  const prefsAfterEnsure = await ensureDefaultPreferences(user.id);

  return {
    user: { id: user.id, name: user.name, role: user.role },
    knockUserId: knockUserId(user.id),
    token: await signFeedToken(user.id),
    publicKey: knockKeys.publicKey,
    feedChannelId: knockKeys.feedChannelId,
    prefsAfterEnsure,
  };
}

const INTENT = {
  selfReply: "trigger-reply-to-me",
  enrollment: "trigger-enrollment-to-me",
} as const;

export async function action({ request }: Route.ActionArgs) {
  const userId = await getCurrentUserId(request);
  if (!userId) throw data("Select a user from the DevUI panel", { status: 401 });
  const me = db.select().from(users).where(eq(users.id, userId)).get()!;
  const intent = (await request.formData()).get("intent");
  try {
    if (intent === INTENT.selfReply) {
      // A synthetic "someone else replied to your question" so we don't need two tabs.
      const other = db.select().from(users).all().find((u) => u.id !== me.id)!;
      const r = await notifyDiscussionReply({
        questionAuthorId: me.id,
        replierId: other.id,
        replierName: other.name,
        lessonTitle: "Prototype lesson",
        url: "/prototype/knock",
        replyId: Date.now(),
      });
      return { intent, result: r };
    }
    if (intent === INTENT.enrollment) {
      const r = await notifyNewEnrollment({
        instructorId: me.id,
        studentName: "Prototype Student",
        courseTitle: "Prototype Course",
      });
      return { intent, result: r };
    }
  } catch (e: any) {
    return { intent, error: `${e.status ?? ""} ${e.message}` };
  }
  return { intent, error: "unknown intent" };
}

type LogLine = { at: string; label: string; status: number; body: unknown };

export default function KnockPrototype({ loaderData }: Route.ComponentProps) {
  const { knockUserId: uid, token, publicKey, feedChannelId } = loaderData;
  const [log, setLog] = useState<LogLine[]>([]);
  const [feed, setFeed] = useState<any>(null);
  const [prefs, setPrefs] = useState<any>(null);
  const fetcher = useFetcher<typeof action>();

  const call = useCallback(
    async (label: string, path: string, init: RequestInit = {}, withToken = true) => {
      const res = await fetch(`${KNOCK_API}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${publicKey}`,
          "Content-Type": "application/json",
          ...(withToken ? { "X-Knock-User-Token": token } : {}),
        },
      });
      const body = await res.json().catch(() => null);
      setLog((l) => [{ at: new Date().toLocaleTimeString(), label, status: res.status, body }, ...l]);
      return { status: res.status, body };
    },
    [publicKey, token]
  );

  const loadFeed = useCallback(async () => {
    const r = await call("list feed", `/users/${uid}/feeds/${feedChannelId}?page_size=20`);
    if (r.status === 200) setFeed(r.body);
  }, [call, uid, feedChannelId]);

  const loadPrefs = useCallback(async () => {
    const r = await call("get preferences", `/users/${uid}/preferences/${PREFERENCE_SET}`);
    if (r.status === 200) setPrefs(r.body);
  }, [call, uid]);

  useEffect(() => {
    setFeed(null);
    setPrefs(null);
    loadFeed();
    loadPrefs();
  }, [loadFeed, loadPrefs]);

  useEffect(() => {
    if (fetcher.data) {
      setLog((l) => [{ at: new Date().toLocaleTimeString(), label: `server ${fetcher.data!.intent}`, status: "error" in fetcher.data! ? 0 : 200, body: fetcher.data }, ...l]);
      // Knock processes workflows async; give it a moment.
      setTimeout(loadFeed, 1500);
    }
  }, [fetcher.data, loadFeed]);

  const markMessages = (status: "seen" | "read" | "unread", ids: string[]) =>
    call(`mark ${status} (${ids.length})`, `/messages/batch/${status}`, {
      method: "POST",
      body: JSON.stringify({ message_ids: ids }),
    }).then(loadFeed);

  const markAll = (status: "seen" | "read") =>
    call(`mark ALL ${status} (bulk)`, `/channels/${feedChannelId}/messages/bulk/${status}`, {
      method: "POST",
      body: JSON.stringify({ user_ids: [uid] }),
    }).then(() => setTimeout(loadFeed, 1500));

  const enrollmentsOn = prefs?.categories?.[CATEGORY.enrollments]?.channel_types?.[IN_APP_FEED] ?? null;
  const setEnrollments = (on: boolean) =>
    call(`set enrollments.in_app_feed=${on}`, `/users/${uid}/preferences/${PREFERENCE_SET}`, {
      method: "PUT",
      body: JSON.stringify({
        __persistence_strategy__: "merge",
        categories: { [CATEGORY.enrollments]: { channel_types: { [IN_APP_FEED]: on } } },
      }),
    }).then(loadPrefs);

  const items: any[] = feed?.entries ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 font-mono text-sm">
      <div className="rounded border-2 border-dashed border-amber-500 bg-amber-50 p-3 text-amber-900 dark:bg-amber-950 dark:text-amber-100">
        PROTOTYPE — Knock spike (#25). Viewing as <b>{loaderData.user.name}</b> ({loaderData.user.role}) → Knock user <b>{uid}</b>. Switch users in the DevUI panel and the whole page re-signs.
      </div>

      <section className="space-y-2">
        <h2 className="font-bold">Check 1 — signed user tokens</h2>
        <div className="flex flex-wrap gap-2">
          <button className="rounded border px-2 py-1" onClick={loadFeed}>Feed with my token</button>
          <button className="rounded border px-2 py-1" onClick={() => call("feed WITHOUT token (expect 401)", `/users/${uid}/feeds/${feedChannelId}`, {}, false)}>Feed without token</button>
          <button className="rounded border px-2 py-1" onClick={() => call("someone else's feed with MY token (expect 403)", `/users/cadence-1/feeds/${feedChannelId}`)}>Another user's feed (cadence-1) with my token</button>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">Check 2 — triggering (Node SDK)</h2>
        <p>Real path: post a reply to someone's Discussion Question on a lesson; the question author's feed gets it. Shortcut:</p>
        <fetcher.Form method="post" className="flex gap-2">
          <button name="intent" value={INTENT.selfReply} className="rounded border px-2 py-1">Trigger discussion-reply → me</button>
          <button name="intent" value={INTENT.enrollment} className="rounded border px-2 py-1">Trigger new-enrollment → me</button>
        </fetcher.Form>
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">Check 3 — headless feed</h2>
        <div>
          total <b>{feed?.meta?.total_count ?? "?"}</b> · unread <b>{feed?.meta?.unread_count ?? "?"}</b> · unseen <b>{feed?.meta?.unseen_count ?? "?"}</b>
        </div>
        <div className="flex gap-2">
          <button className="rounded border px-2 py-1" onClick={() => markAll("seen")}>Mark all seen</button>
          <button className="rounded border px-2 py-1" onClick={() => markAll("read")}>Mark all read</button>
        </div>
        <ul className="divide-y rounded border">
          {items.length === 0 && <li className="p-2 text-muted-foreground">empty</li>}
          {items.map((it) => (
            <li key={it.id} className="flex items-start justify-between gap-2 p-2">
              <div>
                <div className={it.read_at ? "" : "font-bold"}>
                  {it.blocks?.[0]?.rendered ? <span dangerouslySetInnerHTML={{ __html: it.blocks[0].rendered }} /> : JSON.stringify(it.data)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {it.source?.key} · {it.inserted_at} · seen {it.seen_at ? "✓" : "✗"} · read {it.read_at ? "✓" : "✗"}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <button className="rounded border px-2" onClick={() => markMessages("seen", [it.id])}>seen</button>
                <button className="rounded border px-2" onClick={() => markMessages(it.read_at ? "unread" : "read", [it.id])}>{it.read_at ? "unread" : "read"}</button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">Check 4 — preferences (opt-in entry)</h2>
        <div>
          enrollments × in_app_feed = <b>{String(enrollmentsOn)}</b> (server wrote <code>false</code> on first visit)
        </div>
        <div className="flex gap-2">
          <button className="rounded border px-2 py-1" onClick={() => setEnrollments(true)}>Opt in</button>
          <button className="rounded border px-2 py-1" onClick={() => setEnrollments(false)}>Opt out</button>
        </div>
        <p>Test: with it off, trigger new-enrollment → nothing arrives. Opt in, trigger again → it arrives.</p>
        <pre className="max-h-40 overflow-auto rounded bg-muted p-2">{JSON.stringify(prefs, null, 2)}</pre>
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">Raw log (newest first)</h2>
        <ul className="max-h-[32rem] space-y-1 overflow-auto">
          {log.map((l, i) => (
            <li key={i} className={l.status >= 200 && l.status < 300 ? "" : "text-red-600"}>
              <details>
                <summary>{l.at} · {l.label} → {l.status}</summary>
                <pre className="overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(l.body, null, 2)}</pre>
              </details>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
