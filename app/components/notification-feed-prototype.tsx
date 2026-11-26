// PROTOTYPE (throwaway) for "What does the Notification Feed look like in Cadence?" (#23).
// Branch prototype/notification-feed only. Never merge.
//
// Three structurally different Notification Feeds, mounted in the real app layout:
//   A  Bell popover   — bell in the sidebar header, badge = unseen, opening marks all seen.
//   B  Side drawer    — "Notifications" nav item, badge = unread, right-hand drawer with
//                       Unread/All tabs, day groups and per-row read/archive actions.
//   C  Inbox page     — "Notifications" nav item with a dot, a full page with category
//                       filters and bulk actions, plus a toast when something new arrives.
import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router";
import { toast } from "sonner";
import {
  Archive,
  Bell,
  CheckCheck,
  CheckCircle2,
  GraduationCap,
  Inbox,
  MailOpen,
  Mail,
  MessageCircleQuestion,
  MessageSquareReply,
  Receipt,
  Ticket,
  X,
  XCircle,
} from "lucide-react";
import { cn } from "~/lib/utils";
import {
  DayBucket,
  GROUP_OF,
  NotificationGroup,
  NotificationKind,
  dayBucket,
  relativeTime,
  useFeed,
  type FeedItem,
} from "~/lib/notification-feed-prototype";

export const FeedVariant = { A: "A", B: "B", C: "C" } as const;
export type FeedVariant = (typeof FeedVariant)[keyof typeof FeedVariant];

export const VARIANT_NAMES: Record<FeedVariant, string> = {
  [FeedVariant.A]: "Bell popover",
  [FeedVariant.B]: "Side drawer",
  [FeedVariant.C]: "Inbox page",
};

const BADGE_CAP = 9;
const DRAWER_TABS = { Unread: "Unread", All: "All" } as const;
type DrawerTab = (typeof DRAWER_TABS)[keyof typeof DRAWER_TABS];
const ALL_GROUPS = "All";

const navClass = (isActive: boolean) =>
  cn(
    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
    isActive
      ? "bg-sidebar-accent text-sidebar-accent-foreground"
      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
  );

function badgeText(n: number) {
  return n > BADGE_CAP ? `${BADGE_CAP}+` : String(n);
}

export function KindIcon({ kind, className }: { kind: NotificationKind; className?: string }) {
  const c = cn("size-4", className);
  switch (kind) {
    case NotificationKind.RefundApproved:
      return <CheckCircle2 className={cn(c, "text-emerald-600")} />;
    case NotificationKind.RefundDeclined:
      return <XCircle className={cn(c, "text-rose-600")} />;
    case NotificationKind.OpenRefundRequest:
      return <Receipt className={cn(c, "text-amber-600")} />;
    case NotificationKind.SeatClaimed:
      return <Ticket className={cn(c, "text-sky-600")} />;
    case NotificationKind.NewEnrollment:
      return <GraduationCap className={cn(c, "text-violet-600")} />;
    case NotificationKind.DiscussionQuestion:
      return <MessageCircleQuestion className={cn(c, "text-blue-600")} />;
    case NotificationKind.DiscussionReply:
      return <MessageSquareReply className={cn(c, "text-blue-600")} />;
  }
}

function Sentence({ item }: { item: FeedItem }) {
  return (
    <>
      <b className="font-semibold">{item.actor}</b> {item.action} <b className="font-semibold">{item.subject}</b>
    </>
  );
}

function useOpenItem() {
  const feed = useFeed();
  const navigate = useNavigate();
  return (item: FeedItem) => {
    if (!item.readAt) feed.markRead([item.id]);
    navigate(item.url);
  };
}

function FeedStatus() {
  const feed = useFeed();
  if (feed.error) return <div className="p-4 text-sm text-rose-600">{feed.error}</div>;
  if (feed.loading) return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;
  return null;
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onOutside: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onOutside();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, onOutside, active]);
}

// ---------------------------------------------------------------- A: Bell popover

export function VariantABell() {
  const feed = useFeed();
  const open = useOpenItem();
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setIsOpen(false), isOpen);

  function toggle() {
    const next = !isOpen;
    setIsOpen(next);
    // Opening the popover marks everything seen: the badge clears, unread stays bold.
    if (next && feed.unseenCount > 0) feed.markAllSeen();
  }

  return (
    <div ref={ref} className="relative ml-auto">
      <button
        onClick={toggle}
        title="Notifications"
        className="relative rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <Bell className="size-5" />
        {feed.unseenCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
            {badgeText(feed.unseenCount)}
          </span>
        )}
      </button>
      {isOpen && (
        <div className="absolute left-full top-0 z-50 ml-3 w-96 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="font-semibold">Notifications</span>
            <button
              onClick={feed.markAllRead}
              disabled={feed.unreadCount === 0}
              className="text-xs text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
            >
              Mark all as read
            </button>
          </div>
          <FeedStatus />
          <ul className="max-h-[28rem] divide-y overflow-y-auto">
            {feed.items.length === 0 && !feed.loading && (
              <li className="p-8 text-center text-sm text-muted-foreground">You're all caught up.</li>
            )}
            {feed.items.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => {
                    setIsOpen(false);
                    open(item);
                  }}
                  className={cn("flex w-full gap-3 px-4 py-3 text-left text-sm hover:bg-muted", !item.readAt && "bg-primary/5")}
                >
                  <KindIcon kind={item.kind} className="mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className={cn(item.readAt && "text-muted-foreground")}>
                      <Sentence item={item} />
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{relativeTime(item.insertedAt)}</div>
                  </div>
                  {!item.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- B: Side drawer

export function VariantBDrawer() {
  const feed = useFeed();
  const open = useOpenItem();
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<DrawerTab>(DRAWER_TABS.Unread);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setIsOpen(false), isOpen);

  const shown = tab === DRAWER_TABS.Unread ? feed.items.filter((i) => !i.readAt) : feed.items;
  const buckets = Object.values(DayBucket)
    .map((b) => ({ bucket: b, items: shown.filter((i) => dayBucket(i.insertedAt) === b) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      <button
        onClick={() => {
          setIsOpen(true);
          if (feed.unseenCount > 0) feed.markAllSeen();
        }}
        className={cn(navClass(isOpen), "w-full")}
      >
        <Bell className="size-4" />
        Notifications
        {feed.unreadCount > 0 && (
          <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
            {feed.unreadCount}
          </span>
        )}
      </button>
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-black/20">
          <div
            ref={ref}
            className="absolute right-0 top-0 flex h-full w-[28rem] flex-col border-l bg-background text-foreground shadow-2xl"
          >
            <div className="flex items-center gap-2 border-b px-5 py-4">
              <h2 className="text-lg font-semibold">Notifications</h2>
              <button
                onClick={feed.markAllRead}
                disabled={feed.unreadCount === 0}
                title="Mark all as read"
                className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-40"
              >
                <CheckCheck className="size-4" />
              </button>
              <button onClick={() => setIsOpen(false)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted">
                <X className="size-4" />
              </button>
            </div>
            <div className="flex gap-1 border-b px-5">
              {Object.values(DRAWER_TABS).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    "-mb-px border-b-2 px-3 py-2 text-sm",
                    tab === t ? "border-primary font-semibold" : "border-transparent text-muted-foreground"
                  )}
                >
                  {t}
                  {t === DRAWER_TABS.Unread && feed.unreadCount > 0 && ` (${feed.unreadCount})`}
                </button>
              ))}
            </div>
            <FeedStatus />
            <div className="flex-1 overflow-y-auto">
              {buckets.length === 0 && !feed.loading && (
                <div className="flex flex-col items-center gap-2 p-12 text-sm text-muted-foreground">
                  <Inbox className="size-8" />
                  {tab === DRAWER_TABS.Unread ? "No unread Notifications." : "No Notifications yet."}
                </div>
              )}
              {buckets.map((g) => (
                <section key={g.bucket}>
                  <h3 className="sticky top-0 bg-background px-5 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {g.bucket}
                  </h3>
                  {g.items.map((item) => (
                    <div key={item.id} className="group relative flex gap-3 px-5 py-3 hover:bg-muted">
                      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted group-hover:bg-background">
                        <KindIcon kind={item.kind} />
                      </div>
                      <button
                        onClick={() => {
                          setIsOpen(false);
                          open(item);
                        }}
                        className="min-w-0 flex-1 text-left text-sm"
                      >
                        <div className={cn(!item.readAt ? "text-foreground" : "text-muted-foreground")}>
                          <Sentence item={item} />
                        </div>
                        {item.detail && <div className="mt-1 line-clamp-2 text-muted-foreground">{item.detail}</div>}
                        <div className="mt-1 text-xs text-muted-foreground">
                          {GROUP_OF[item.kind]} · {relativeTime(item.insertedAt)}
                        </div>
                      </button>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {!item.readAt && <span className="mt-1.5 size-2 rounded-full bg-primary group-hover:hidden" />}
                        <div className="hidden gap-1 group-hover:flex">
                          <button
                            title={item.readAt ? "Mark as unread" : "Mark as read"}
                            onClick={() => (item.readAt ? feed.markUnread([item.id]) : feed.markRead([item.id]))}
                            className="rounded p-1 text-muted-foreground hover:bg-background"
                          >
                            {item.readAt ? <Mail className="size-4" /> : <MailOpen className="size-4" />}
                          </button>
                          <button
                            title="Archive"
                            onClick={() => feed.archive([item.id])}
                            className="rounded p-1 text-muted-foreground hover:bg-background"
                          >
                            <Archive className="size-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- C: Inbox page

export function VariantCNavLink() {
  const feed = useFeed();
  useArrivalToasts();
  return (
    <NavLink to="/notifications" className={({ isActive }) => navClass(isActive)}>
      <Bell className="size-4" />
      Notifications
      {feed.unseenCount > 0 && <span className="ml-auto size-2 rounded-full bg-rose-600" />}
    </NavLink>
  );
}

/** C only: a toast for each Notification that arrives while you're in the app. */
function useArrivalToasts() {
  const feed = useFeed();
  const open = useOpenItem();
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (feed.loading) return;
    const ids = new Set(feed.items.map((i) => i.id));
    if (known.current) {
      for (const item of feed.items) {
        if (!known.current.has(item.id)) {
          toast(
            <span>
              <Sentence item={item} />
            </span>,
            { action: { label: "Open", onClick: () => open(item) } }
          );
        }
      }
    }
    known.current = ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed.items, feed.loading]);
}

export function VariantCInboxPage() {
  const feed = useFeed();
  const open = useOpenItem();
  const [group, setGroup] = useState<NotificationGroup | typeof ALL_GROUPS>(ALL_GROUPS);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Visiting the page marks everything seen (the sidebar dot clears).
  useEffect(() => {
    if (!feed.loading && feed.unseenCount > 0) feed.markAllSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed.loading]);

  const groups = Object.values(NotificationGroup).filter((g) => feed.items.some((i) => GROUP_OF[i.kind] === g));
  const shown = group === ALL_GROUPS ? feed.items : feed.items.filter((i) => GROUP_OF[i.kind] === group);
  const selectedIds = shown.filter((i) => selected.has(i.id)).map((i) => i.id);
  const allSelected = shown.length > 0 && selectedIds.length === shown.length;

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  return (
    <div className="mx-auto flex max-w-5xl gap-8 p-8">
      <aside className="w-48 shrink-0 space-y-1">
        <h1 className="mb-4 text-2xl font-bold">Notifications</h1>
        {[ALL_GROUPS, ...groups].map((g) => {
          const count = (g === ALL_GROUPS ? feed.items : feed.items.filter((i) => GROUP_OF[i.kind] === g)).filter(
            (i) => !i.readAt
          ).length;
          return (
            <button
              key={g}
              onClick={() => {
                setGroup(g as NotificationGroup | typeof ALL_GROUPS);
                setSelected(new Set());
              }}
              className={cn(
                "flex w-full items-center justify-between rounded-md px-3 py-2 text-sm",
                group === g ? "bg-muted font-semibold" : "text-muted-foreground hover:bg-muted"
              )}
            >
              {g}
              {count > 0 && <span className="text-xs">{count}</span>}
            </button>
          );
        })}
      </aside>

      <div className="min-w-0 flex-1">
        <div className="mb-3 flex h-9 items-center gap-3 border-b pb-3 text-sm">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => setSelected(allSelected ? new Set() : new Set(shown.map((i) => i.id)))}
          />
          {selectedIds.length > 0 ? (
            <>
              <span className="text-muted-foreground">{selectedIds.length} selected</span>
              <button className="rounded border px-2 py-1 hover:bg-muted" onClick={() => feed.markRead(selectedIds)}>
                Mark read
              </button>
              <button className="rounded border px-2 py-1 hover:bg-muted" onClick={() => feed.markUnread(selectedIds)}>
                Mark unread
              </button>
              <button
                className="rounded border px-2 py-1 hover:bg-muted"
                onClick={() => {
                  feed.archive(selectedIds);
                  setSelected(new Set());
                }}
              >
                Archive
              </button>
            </>
          ) : (
            <button
              className="ml-auto text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
              disabled={feed.unreadCount === 0}
              onClick={feed.markAllRead}
            >
              Mark all as read
            </button>
          )}
        </div>
        <FeedStatus />
        {shown.length === 0 && !feed.loading && (
          <div className="p-12 text-center text-sm text-muted-foreground">Nothing here.</div>
        )}
        <ul className="divide-y rounded-lg border">
          {shown.map((item) => (
            <li key={item.id} className={cn("flex items-center gap-4 px-4 py-3", !item.readAt && "bg-primary/5")}>
              <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} />
              <KindIcon kind={item.kind} className="shrink-0" />
              <div className="min-w-0 flex-1 text-sm">
                <div className={cn("truncate", item.readAt ? "text-muted-foreground" : "font-medium")}>
                  <Sentence item={item} />
                </div>
                {item.detail && <div className="truncate text-muted-foreground">{item.detail}</div>}
              </div>
              <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">{relativeTime(item.insertedAt)}</span>
              <button className="shrink-0 rounded-md border px-3 py-1 text-sm hover:bg-muted" onClick={() => open(item)}>
                Open
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
