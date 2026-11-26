// PROTOTYPE (throwaway) for "What does the Notification Feed look like in Cadence?" (#23).
// Branch prototype/notification-feed only. Never merge.
//
// Shared feed state for the three layout variants. Two sources:
//   - "knock": the real Knock feed for whoever the DevUI switcher selected,
//     read from the browser with the public key + signed user token.
//   - "sample": an in-memory feed holding one of each catalogue Notification,
//     so rows for workflows that don't exist in Knock yet can be judged too.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const KNOCK_API = "https://api.knock.app/v1";
const FEED_POLL_MS = 5000;
const FEED_PAGE_SIZE = 50;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export const FeedSource = { Knock: "knock", Sample: "sample" } as const;
export type FeedSource = (typeof FeedSource)[keyof typeof FeedSource];

export const NotificationKind = {
  RefundApproved: "refund-approved",
  RefundDeclined: "refund-declined",
  OpenRefundRequest: "open-refund-request",
  SeatClaimed: "seat-claimed",
  NewEnrollment: "new-enrollment",
  DiscussionQuestion: "discussion-question",
  DiscussionReply: "discussion-reply",
} as const;
export type NotificationKind = (typeof NotificationKind)[keyof typeof NotificationKind];

export const NotificationGroup = {
  Refunds: "Refunds",
  Discussions: "Discussions",
  Team: "Team",
  Enrollments: "Enrollments",
} as const;
export type NotificationGroup = (typeof NotificationGroup)[keyof typeof NotificationGroup];

export const GROUP_OF: Record<NotificationKind, NotificationGroup> = {
  [NotificationKind.RefundApproved]: NotificationGroup.Refunds,
  [NotificationKind.RefundDeclined]: NotificationGroup.Refunds,
  [NotificationKind.OpenRefundRequest]: NotificationGroup.Refunds,
  [NotificationKind.SeatClaimed]: NotificationGroup.Team,
  [NotificationKind.NewEnrollment]: NotificationGroup.Enrollments,
  [NotificationKind.DiscussionQuestion]: NotificationGroup.Discussions,
  [NotificationKind.DiscussionReply]: NotificationGroup.Discussions,
};

/** What every variant renders. Built from structured data, never from Knock's rendered template. */
export type FeedItem = {
  id: string;
  kind: NotificationKind;
  actor: string;
  /** Sentence after the actor, e.g. "replied to your question in". */
  action: string;
  /** The thing it's about: a lesson, course or Purchase. */
  subject: string;
  /** Optional quote or note: a snippet, the decision note, the amount. */
  detail?: string;
  url: string;
  insertedAt: string;
  seenAt: string | null;
  readAt: string | null;
};

export type KnockSession = {
  knockUserId: string;
  token: string;
  publicKey: string;
  feedChannelId: string;
};

type MarkStatus = "seen" | "read" | "unread" | "archived";

export type Feed = {
  source: FeedSource;
  items: FeedItem[];
  unseenCount: number;
  unreadCount: number;
  loading: boolean;
  error: string | null;
  markSeen: (ids: string[]) => void;
  markRead: (ids: string[]) => void;
  markUnread: (ids: string[]) => void;
  archive: (ids: string[]) => void;
  markAllSeen: () => void;
  markAllRead: () => void;
  reload: () => void;
};

// ---------- Knock → FeedItem ----------

function fromKnock(entry: any): FeedItem | null {
  const d = entry.data ?? {};
  const base = {
    id: entry.id as string,
    insertedAt: entry.inserted_at as string,
    seenAt: entry.seen_at as string | null,
    readAt: entry.read_at as string | null,
  };
  switch (entry.source?.key) {
    case NotificationKind.DiscussionReply:
      return {
        ...base,
        kind: NotificationKind.DiscussionReply,
        actor: d.actor_name ?? "Someone",
        action: "replied to your question in",
        subject: d.lesson_title ?? "a lesson",
        detail: d.snippet,
        url: d.url ?? "/courses",
      };
    case NotificationKind.NewEnrollment:
      return {
        ...base,
        kind: NotificationKind.NewEnrollment,
        actor: d.student_name ?? "A Student",
        action: "enrolled in",
        subject: d.course_title ?? "your course",
        url: d.url ?? "/instructor",
      };
    default:
      return null;
  }
}

// ---------- Sample feed: one of each catalogue entry ----------

function ago(ms: number) {
  return new Date(Date.now() - ms).toISOString();
}

function sampleItems(): FeedItem[] {
  return [
    {
      id: "s1", kind: NotificationKind.DiscussionReply, actor: "Maya Patel",
      action: "replied to your question in", subject: "Closures and scope",
      detail: "“The inner function keeps a reference to the outer variable, not a copy…”",
      url: "/courses", insertedAt: ago(4 * MINUTE_MS), seenAt: null, readAt: null,
    },
    {
      id: "s2", kind: NotificationKind.OpenRefundRequest, actor: "Jonas Berg",
      action: "asked for a refund on", subject: "TypeScript Fundamentals",
      detail: "$49.00 · “The course wasn't what I expected”",
      url: "/admin/refunds", insertedAt: ago(40 * MINUTE_MS), seenAt: null, readAt: null,
    },
    {
      id: "s3", kind: NotificationKind.DiscussionQuestion, actor: "Liam O'Connor",
      action: "asked a question in", subject: "Setting up Vitest",
      detail: "“Why does my mock leak between tests?”",
      url: "/instructor/questions", insertedAt: ago(3 * HOUR_MS), seenAt: ago(2 * HOUR_MS), readAt: null,
    },
    {
      id: "s4", kind: NotificationKind.RefundApproved, actor: "Cadence",
      action: "approved your Refund Request for", subject: "React Patterns",
      detail: "“Refunded in full, sorry it wasn't a fit.”",
      url: "/dashboard", insertedAt: ago(5 * HOUR_MS), seenAt: ago(4 * HOUR_MS), readAt: ago(4 * HOUR_MS),
    },
    {
      id: "s5", kind: NotificationKind.SeatClaimed, actor: "Priya Shah",
      action: "claimed a Seat on", subject: "Node.js in Production",
      detail: "3 of 10 Seats left",
      url: "/team", insertedAt: ago(DAY_MS + 2 * HOUR_MS), seenAt: null, readAt: null,
    },
    {
      id: "s6", kind: NotificationKind.NewEnrollment, actor: "Ana Souza",
      action: "enrolled in", subject: "Closures and scope",
      url: "/instructor", insertedAt: ago(DAY_MS + 6 * HOUR_MS), seenAt: ago(DAY_MS), readAt: ago(DAY_MS),
    },
    {
      id: "s7", kind: NotificationKind.RefundDeclined, actor: "Cadence",
      action: "declined your Refund Request for", subject: "SQL for Developers",
      detail: "“You've completed 80% of the course.” You can ask again.",
      url: "/dashboard", insertedAt: ago(4 * DAY_MS), seenAt: ago(3 * DAY_MS), readAt: ago(3 * DAY_MS),
    },
  ];
}

// ---------- hooks ----------

function useKnockFeed(session: KnockSession | null, enabled: boolean): Feed {
  const [entries, setEntries] = useState<any[]>([]);
  const [meta, setMeta] = useState({ unseen: 0, unread: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const call = useCallback(
    async (path: string, init: RequestInit = {}) => {
      if (!session) return null;
      const res = await fetch(`${KNOCK_API}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${session.publicKey}`,
          "Content-Type": "application/json",
          "X-Knock-User-Token": session.token,
        },
      });
      if (!res.ok) throw new Error(`${res.status} ${path}`);
      return res.json();
    },
    [session]
  );

  const reload = useCallback(async () => {
    if (!session || !enabled) return;
    try {
      const body = await call(`/users/${session.knockUserId}/feeds/${session.feedChannelId}?page_size=${FEED_PAGE_SIZE}`);
      setEntries(body.entries ?? []);
      setMeta({ unseen: body.meta?.unseen_count ?? 0, unread: body.meta?.unread_count ?? 0 });
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [call, session, enabled]);

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    reload();
    const t = setInterval(reload, FEED_POLL_MS);
    return () => clearInterval(t);
  }, [reload, enabled]);

  const mark = useCallback(
    async (status: MarkStatus, ids: string[]) => {
      if (ids.length === 0) return;
      await call(`/messages/batch/${status}`, { method: "POST", body: JSON.stringify({ message_ids: ids }) });
      reload();
    },
    [call, reload]
  );

  const markAll = useCallback(
    async (status: "seen" | "read") => {
      if (!session) return;
      await call(`/channels/${session.feedChannelId}/messages/bulk/${status}`, {
        method: "POST",
        body: JSON.stringify({ user_ids: [session.knockUserId] }),
      });
      // Bulk is async on Knock's side: poll picks it up, but refresh soon too.
      setTimeout(reload, 1000);
    },
    [call, reload, session]
  );

  const items = useMemo(() => entries.map(fromKnock).filter((x): x is FeedItem => x !== null), [entries]);

  return {
    source: FeedSource.Knock,
    items,
    unseenCount: meta.unseen,
    unreadCount: meta.unread,
    loading,
    error: session ? error : "No user selected in the DevUI panel",
    markSeen: (ids) => mark("seen", ids),
    markRead: (ids) => mark("read", ids),
    markUnread: (ids) => mark("unread", ids),
    archive: (ids) => mark("archived", ids),
    markAllSeen: () => markAll("seen"),
    markAllRead: () => markAll("read"),
    reload,
  };
}

function useSampleFeed(): Feed {
  const [items, setItems] = useState<FeedItem[]>(sampleItems);
  const now = () => new Date().toISOString();
  const patch = (ids: string[], f: (i: FeedItem) => FeedItem) =>
    setItems((xs) => xs.map((x) => (ids.includes(x.id) ? f(x) : x)));
  return {
    source: FeedSource.Sample,
    items,
    unseenCount: items.filter((i) => !i.seenAt).length,
    unreadCount: items.filter((i) => !i.readAt).length,
    loading: false,
    error: null,
    markSeen: (ids) => patch(ids, (i) => ({ ...i, seenAt: i.seenAt ?? now() })),
    markRead: (ids) => patch(ids, (i) => ({ ...i, seenAt: i.seenAt ?? now(), readAt: now() })),
    markUnread: (ids) => patch(ids, (i) => ({ ...i, readAt: null })),
    archive: (ids) => setItems((xs) => xs.filter((x) => !ids.includes(x.id))),
    markAllSeen: () => setItems((xs) => xs.map((i) => ({ ...i, seenAt: i.seenAt ?? now() }))),
    markAllRead: () => setItems((xs) => xs.map((i) => ({ ...i, seenAt: i.seenAt ?? now(), readAt: i.readAt ?? now() }))),
    reload: () => setItems(sampleItems()),
  };
}

const FeedContext = createContext<Feed | null>(null);

export function FeedProvider({
  session,
  source,
  children,
}: {
  session: KnockSession | null;
  source: FeedSource;
  children: React.ReactNode;
}) {
  const knock = useKnockFeed(session, source === FeedSource.Knock);
  const sample = useSampleFeed();
  return <FeedContext.Provider value={source === FeedSource.Knock ? knock : sample}>{children}</FeedContext.Provider>;
}

export function useFeed() {
  const feed = useContext(FeedContext);
  if (!feed) throw new Error("useFeed outside FeedProvider");
  return feed;
}

// ---------- formatting ----------

export function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < MINUTE_MS) return "just now";
  if (diff < HOUR_MS) return `${Math.floor(diff / MINUTE_MS)}m ago`;
  if (diff < DAY_MS) return `${Math.floor(diff / HOUR_MS)}h ago`;
  return `${Math.floor(diff / DAY_MS)}d ago`;
}

export const DayBucket = { Today: "Today", Yesterday: "Yesterday", Earlier: "Earlier" } as const;
export type DayBucket = (typeof DayBucket)[keyof typeof DayBucket];

export function dayBucket(iso: string): DayBucket {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const t = new Date(iso).getTime();
  if (t >= startOfToday.getTime()) return DayBucket.Today;
  if (t >= startOfToday.getTime() - DAY_MS) return DayBucket.Yesterday;
  return DayBucket.Earlier;
}
