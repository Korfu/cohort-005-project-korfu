import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "~/db";
import {
  coupons,
  lessonProgress,
  lessons,
  LessonProgressStatus,
  modules,
  purchases,
  refunds,
  RefundStatus,
  videoWatchEvents,
} from "~/db/schema";
import {
  findRefundBlocker,
  getRefundAmount,
  lastDayOfRefundPeriod,
  RefundBlocker,
} from "./refunds";

type Purchase = typeof purchases.$inferSelect;

export type RefundCheck =
  | {
      ok: true;
      purchase: Purchase;
      amount: number;
      lastDayOfRefundPeriod: string;
    }
  | { ok: false; blocker: RefundBlocker };

function getLatestPurchase(userId: number, courseId: number) {
  return db
    .select()
    .from(purchases)
    .where(and(eq(purchases.userId, userId), eq(purchases.courseId, courseId)))
    .orderBy(sql`${purchases.createdAt} desc`)
    .get();
}

function hasRequestedRefund(purchaseId: number) {
  return !!db
    .select({ id: refunds.id })
    .from(refunds)
    .where(
      and(
        eq(refunds.purchaseId, purchaseId),
        eq(refunds.status, RefundStatus.Requested)
      )
    )
    .get();
}

// Licenses are stored in the `coupons` table.
function hasClaimedLicense(purchaseId: number) {
  return !!db
    .select({ id: coupons.id })
    .from(coupons)
    .where(
      and(eq(coupons.purchaseId, purchaseId), isNotNull(coupons.redeemedAt))
    )
    .get();
}

function getLessonIdsForCourse(courseId: number): number[] {
  return db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .all()
    .map((row) => row.id);
}

function getCompletedLessonCount(userId: number, lessonIds: number[]) {
  if (lessonIds.length === 0) return 0;

  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.status, LessonProgressStatus.Completed),
        inArray(lessonProgress.lessonId, lessonIds)
      )
    )
    .get();

  return result?.count ?? 0;
}

function getSecondsWatched(userId: number, lessonIds: number[]) {
  if (lessonIds.length === 0) return 0;

  const furthestPerLesson = db
    .select({
      furthest: sql<number>`max(${videoWatchEvents.positionSeconds})`,
    })
    .from(videoWatchEvents)
    .where(
      and(
        eq(videoWatchEvents.userId, userId),
        inArray(videoWatchEvents.lessonId, lessonIds)
      )
    )
    .groupBy(videoWatchEvents.lessonId)
    .all();

  return furthestPerLesson.reduce((total, row) => total + row.furthest, 0);
}

/**
 * Whether the learner may request a Refund on their latest Purchase of this
 * course, and for how much. The course page and the refund action both use
 * this, so the button and the server always agree.
 */
export function checkRefund(
  userId: number,
  course: { id: number; price: number }
): RefundCheck {
  const purchase = getLatestPurchase(userId, course.id);
  if (!purchase) return { ok: false, blocker: RefundBlocker.NoPurchase };

  const lessonIds = getLessonIdsForCourse(course.id);
  const blocker = findRefundBlocker({
    purchasedAt: purchase.createdAt,
    hasRequestedRefund: hasRequestedRefund(purchase.id),
    hasClaimedLicense: hasClaimedLicense(purchase.id),
    lessonCount: lessonIds.length,
    completedLessonCount: getCompletedLessonCount(userId, lessonIds),
    secondsWatched: getSecondsWatched(userId, lessonIds),
  });

  if (blocker) return { ok: false, blocker };

  return {
    ok: true,
    purchase,
    amount: getRefundAmount(purchase, course.price),
    lastDayOfRefundPeriod: lastDayOfRefundPeriod(purchase.createdAt),
  };
}

export function requestRefund(purchaseId: number, reason: string) {
  return db
    .insert(refunds)
    .values({ purchaseId, status: RefundStatus.Requested, reason })
    .returning()
    .get();
}
