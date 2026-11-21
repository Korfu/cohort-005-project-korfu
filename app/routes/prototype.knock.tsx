// PROTOTYPE (throwaway) — "Does Knock hold up against Cadence?" (#25).
// Branch prototype/knock-spike only. Never merge.
//
// The server signs a Knock user token for whoever the DevUI switcher selected.
// Everything under "Headless feed" is called from the BROWSER with only the
// public key + that token, so it exercises the real client-side auth path.
// Reply / Enroll buttons act as the current DevUI user against real data.
import { useCallback, useEffect, useState } from "react";
import { data, useFetcher } from "react-router";
import { and, desc, eq, isNull, ne } from "drizzle-orm";
import type { Route } from "./+types/prototype.knock";
import { getCurrentUserId } from "~/lib/session";
import { db } from "~/db";
import { comments, courses, lessons, users } from "~/db/schema";
import {
  ensureDefaultPreferences,
  getServerPreferences,
  identify,
  knockKeys,
  knockUserId,
  notifyDiscussionReply,
  notifyNewEnrollment,
  resetPreferences,
  setEnrollmentFeedPreference,
  signFeedToken,
} from "~/lib/knock-prototype.server";

const KNOCK_API = "https://api.knock.app/v1";
const IN_APP_FEED = "in_app_feed";
const PREFERENCE_SET = "default";
const ENROLLMENTS_CATEGORY = "enrollments";
// Mirrors knockUserId() in knock-prototype.server.ts (that module can't reach the client).
const toKnockUserId = (cadenceUserId: number) => `cadence-${cadenceUserId}`;
const FEED_POLL_MS = 3000;
const LIST_LIMIT = 5;
const PREVIEW_CHARS = 40;

const INTENT = {
  reply: "reply",
  enroll: "enroll",
  optIn: "opt-in-enrollment",
  optOut: "opt-out-enrollment",
  reset: "reset-preferences",
} as const;

async function requireUser(request: Request) {
  const userId = await getCurrentUserId(request);
  if (!userId) throw data("Select a user from the DevUI panel", { status: 401 });
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) throw data("User not found", { status: 404 });
  return user;
}

export async function loader({ request }: Route.LoaderArgs) {
  const me = await requireUser(request);
  await identify(me);
  await ensureDefaultPreferences(me.id);

  // Latest Discussion Questions asked by someone else: replying notifies them.
  const questions = db
    .select({
      id: comments.id,
      body: comments.body,
      lessonId: comments.lessonId,
      authorId: users.id,
      authorName: users.name,
    })
    .from(comments)
    .innerJoin(users, eq(comments.userId, users.id))
    .where(and(isNull(comments.parentId), isNull(comments.deletedAt), ne(comments.userId, me.id)))
    .orderBy(desc(comments.createdAt))
    .limit(LIST_LIMIT)
    .all();

  // Courses taught by someone else: "enrolling" notifies their Instructor.
  const courseList = db
    .select({ id: courses.id, title: courses.title, instructorId: users.id, instructorName: users.name })
    .from(courses)
    .innerJoin(users, eq(courses.instructorId, users.id))
    .where(ne(courses.instructorId, me.id))
    .limit(LIST_LIMIT)
    .all();

  const serverPrefs = await getServerPreferences(me.id).catch((e: any) => ({ error: `${e.status} ${e.message}` }));

  return {
    user: { id: me.id, name: me.name, role: me.role },
    knockUserId: knockUserId(me.id),
    token: await signFeedToken(me.id),
    publicKey: knockKeys.publicKey,
    feedChannelId: knockKeys.feedChannelId,
    questions,
    courses: courseList,
    serverPrefs,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const me = await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  try {
    if (intent === INTENT.reply) {
      const questionId = Number(form.get("questionId"));
      const question = db.select().from(comments).where(eq(comments.id, questionId)).get();
      if (!question) return { intent, error: "question not found" };
      const lesson = db.select().from(lessons).where(eq(lessons.id, question.lessonId)).get()!;
      // A real Discussion Reply row, written as the current DevUI user.
      const reply = db
        .insert(comments)
        .values({ userId: me.id, lessonId: question.lessonId, parentId: question.id, body: `Prototype reply from ${me.name}` })
        .returning()
        .get();
      const result = await notifyDiscussionReply({
        questionAuthorId: question.userId,
        replierId: me.id,
        replierName: me.name,
        lessonTitle: lesson.title,
        url: `/prototype/knock#comment-${reply.id}`,
        replyId: reply.id,
      });
      return { intent, notified: knockUserId(question.userId), replyId: reply.id, result };
    }
    if (intent === INTENT.enroll) {
      // Only the notification: no Enrollment row is written.
      const courseId = Number(form.get("courseId"));
      const course = db.select().from(courses).where(eq(courses.id, courseId)).get();
      if (!course) return { intent, error: "course not found" };
      const result = await notifyNewEnrollment({
        instructorId: course.instructorId,
        studentName: me.name,
        courseTitle: course.title,
      });
      return { intent, notified: knockUserId(course.instructorId), result };
    }
    if (intent === INTENT.optIn) return { intent, result: await setEnrollmentFeedPreference(me.id, true) };
    if (intent === INTENT.optOut) return { intent, result: await setEnrollmentFeedPreference(me.id, false) };
    if (intent === INTENT.reset) {
      await resetPreferences(me.id);
      return { intent, result: "preference set deleted; the page reload re-applies the opt-out default" };
    }
  } catch (e: any) {
    return { intent, error: `${e.status ?? ""} ${e.message}` };
  }
  return { intent, error: "unknown intent" };
}

type LogLine = { at: string; label: string; status: number; body: unknown };

const preview = (s: string) => (s.length > PREVIEW_CHARS ? `${s.slice(0, PREVIEW_CHARS)}…` : s);
const btn = "rounded border px-3 py-1 hover:bg-muted";
const darkBtn = "rounded bg-foreground px-3 py-1 font-bold text-background";

export default function KnockPrototype({ loaderData }: Route.ComponentProps) {
  const { knockUserId: uid, token, publicKey, feedChannelId, user } = loaderData;
  const [log, setLog] = useState<LogLine[]>([]);
  const [feed, setFeed] = useState<any>(null);
  const fetcher = useFetcher<typeof action>();

  const call = useCallback(
    async (label: string, path: string, init: RequestInit = {}, quiet = false) => {
      const res = await fetch(`${KNOCK_API}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${publicKey}`,
          "Content-Type": "application/json",
          "X-Knock-User-Token": token,
        },
      });
      const body = await res.json().catch(() => null);
      if (!quiet) setLog((l) => [{ at: new Date().toLocaleTimeString(), label, status: res.status, body }, ...l]);
      return { status: res.status, body };
    },
    [publicKey, token]
  );

  const loadFeed = useCallback(async () => {
    const r = await call("list feed", `/users/${uid}/feeds/${feedChannelId}?page_size=20`, {}, true);
    if (r.status === 200) setFeed(r.body);
  }, [call, uid, feedChannelId]);

  useEffect(() => {
    setFeed(null);
    loadFeed();
    const t = setInterval(loadFeed, FEED_POLL_MS);
    return () => clearInterval(t);
  }, [loadFeed]);

  const markMessages = (status: "seen" | "read" | "unread", ids: string[]) =>
    call(`mark ${status} (${ids.length})`, `/messages/batch/${status}`, {
      method: "POST",
      body: JSON.stringify({ message_ids: ids }),
    }).then(loadFeed);

  const markAll = (status: "seen" | "read") =>
    call(`mark ALL ${status} (bulk)`, `/channels/${feedChannelId}/messages/bulk/${status}`, {
      method: "POST",
      body: JSON.stringify({ user_ids: [uid] }),
    });

  const otherUserId = uid === toKnockUserId(1) ? toKnockUserId(2) : toKnockUserId(1);
  const items: any[] = feed?.entries ?? [];
  const enrollmentPref =
    (loaderData.serverPrefs as any)?.categories?.[ENROLLMENTS_CATEGORY]?.channel_types?.[IN_APP_FEED];

  const postIntent = (fields: Record<string, string | number>) =>
    fetcher.submit(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, String(v)])), { method: "post" });

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6 font-mono text-sm">
      <div className="rounded border-2 border-dashed border-amber-500 bg-amber-50 p-3 text-amber-900 dark:bg-amber-950 dark:text-amber-100">
        PROTOTYPE — Knock spike (#25). Switch users in the DevUI panel: the whole page re-signs as that user.
      </div>

      <section className="space-y-2">
        <h2 className="font-bold">1. Signed user token</h2>
        <div>
          Signed in as <b>{user.name}</b> ({user.role}), Knock user id <b>{uid}</b>
        </div>
        <div className="text-xs text-muted-foreground">token sub = {uid}</div>
        <div className="flex flex-wrap gap-2">
          <button className={btn} onClick={() => call(`read ${otherUserId}'s feed with MY token (expect 403)`, `/users/${otherUserId}/feeds/${feedChannelId}`)}>
            Try another user's feed with my token (should fail)
          </button>
          <button className={btn} onClick={() => call("read my preferences from the browser", `/users/${uid}/preferences/${PREFERENCE_SET}`)}>
            Read my preferences from the browser
          </button>
        </div>
      </section>

      <div className="grid gap-8 md:grid-cols-2">
        <div className="space-y-8">
          <section className="space-y-2">
            <h2 className="font-bold">2. Trigger Discussion Reply → question author</h2>
            {loaderData.questions.length === 0 && <div className="text-muted-foreground">No questions by other users.</div>}
            {loaderData.questions.map((q) => (
              <div key={q.id} className="flex items-center gap-2">
                <button className={darkBtn} onClick={() => postIntent({ intent: INTENT.reply, questionId: q.id })}>Reply</button>
                <span className="truncate">→ {q.authorName} (id {q.authorId}): "{preview(q.body)}"</span>
              </div>
            ))}
          </section>

          <section className="space-y-2">
            <h2 className="font-bold">4. Trigger new Enrollment → Instructor</h2>
            {loaderData.courses.map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <button className={darkBtn} onClick={() => postIntent({ intent: INTENT.enroll, courseId: c.id })}>Enroll</button>
                <span className="truncate">{c.title} → {c.instructorName} (id {c.instructorId})</span>
              </div>
            ))}
            <div className="flex flex-wrap gap-2 pt-2">
              <button className={btn} onClick={() => postIntent({ intent: INTENT.optIn })}>opt-in-enrollment (me)</button>
              <button className={btn} onClick={() => postIntent({ intent: INTENT.optOut })}>opt-out-enrollment (me)</button>
              <button className={btn} onClick={() => postIntent({ intent: INTENT.reset })}>reset-preferences (me)</button>
            </div>
            <div>
              enrollments × in_app_feed for me = <b>{String(enrollmentPref ?? "unset (Knock default: on)")}</b>
            </div>
            <pre className="max-h-48 overflow-auto rounded bg-muted p-2">
              my server-side preferences: {JSON.stringify(loaderData.serverPrefs, null, 2)}
            </pre>
            <pre className="max-h-48 overflow-auto rounded bg-muted p-2">
              last action: {JSON.stringify(fetcher.data ?? null, null, 2)}
            </pre>
          </section>
        </div>

        <section className="space-y-2">
          <h2 className="font-bold">3. Headless feed (browser → Knock, polled {FEED_POLL_MS / 1000}s)</h2>
          <div>
            unread <b>{feed?.meta?.unread_count ?? "?"}</b> · unseen <b>{feed?.meta?.unseen_count ?? "?"}</b> · total <b>{feed?.meta?.total_count ?? "?"}</b>
          </div>
          <div className="flex gap-2">
            <button className={btn} onClick={() => markAll("seen")}>Mark all seen</button>
            <button className={btn} onClick={() => markAll("read")}>Mark all read</button>
          </div>
          <ul className="divide-y rounded border">
            {items.length === 0 && <li className="p-2 text-muted-foreground">empty</li>}
            {items.map((it) => (
              <li key={it.id} className="flex items-start justify-between gap-2 p-2">
                <div>
                  <div className={it.read_at ? "" : "font-bold"}>
                    {it.blocks?.find((b: any) => b.name === "body")?.rendered ? (
                      <span dangerouslySetInnerHTML={{ __html: it.blocks.find((b: any) => b.name === "body").rendered }} />
                    ) : (
                      JSON.stringify(it.data)
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {it.source?.key} · {new Date(it.inserted_at).toLocaleTimeString()} · seen {it.seen_at ? "✓" : "✗"} · read {it.read_at ? "✓" : "✗"}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button className="rounded border px-2" onClick={() => markMessages("seen", [it.id])}>seen</button>
                  <button className="rounded border px-2" onClick={() => markMessages(it.read_at ? "unread" : "read", [it.id])}>
                    {it.read_at ? "unread" : "read"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="space-y-2">
        <h2 className="font-bold">Browser → Knock log (newest first)</h2>
        <ul className="max-h-[24rem] space-y-1 overflow-auto">
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
