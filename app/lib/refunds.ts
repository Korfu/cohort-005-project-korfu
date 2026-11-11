import { getDiscountForCountry } from "./ppp";

export const REFUND_PERIOD_DAYS = 14;
export const REFUND_WATCH_LIMIT_SECONDS = 2 * 60 * 60;
export const REFUND_COMPLETION_LIMIT = 0.5;

/** Why a learner cannot request a Refund on a Purchase. */
export enum RefundBlocker {
  NoPurchase = "no_purchase",
  AlreadyRequested = "already_requested",
  LicenseClaimed = "license_claimed",
  RefundPeriodOver = "refund_period_over",
  TooMuchCompleted = "too_much_completed",
  TooMuchWatched = "too_much_watched",
}

/** What we know about a Purchase when deciding whether it can be refunded. */
export interface RefundFacts {
  purchasedAt: string;
  hasRequestedRefund: boolean;
  /** One claimed License blocks a Refund of the whole team Purchase. */
  hasClaimedLicense: boolean;
  lessonCount: number;
  completedLessonCount: number;
  secondsWatched: number;
}

// The Refund Period is counted in whole calendar days, not hours — someone
// who buys at 23:00 should still get the whole of their fourteenth day.
export function toCalendarDay(when: Date): string {
  const year = when.getFullYear();
  const month = String(when.getMonth() + 1).padStart(2, "0");
  const day = String(when.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function lastDayOfRefundPeriod(purchasedAtIso: string): string {
  const end = new Date(purchasedAtIso);
  end.setDate(end.getDate() + REFUND_PERIOD_DAYS);
  return toCalendarDay(end);
}

export function isWithinRefundPeriod(
  purchasedAtIso: string,
  now: Date = new Date()
): boolean {
  const today = toCalendarDay(now);
  return (
    today >= toCalendarDay(new Date(purchasedAtIso)) &&
    today <= lastDayOfRefundPeriod(purchasedAtIso)
  );
}

/** The first rule that stops a Refund, or null if the learner may request one. */
export function findRefundBlocker(
  facts: RefundFacts,
  now: Date = new Date()
): RefundBlocker | null {
  if (facts.hasRequestedRefund) return RefundBlocker.AlreadyRequested;
  if (facts.hasClaimedLicense) return RefundBlocker.LicenseClaimed;
  if (!isWithinRefundPeriod(facts.purchasedAt, now)) {
    return RefundBlocker.RefundPeriodOver;
  }
  if (
    facts.lessonCount > 0 &&
    facts.completedLessonCount / facts.lessonCount >= REFUND_COMPLETION_LIMIT
  ) {
    return RefundBlocker.TooMuchCompleted;
  }
  if (facts.secondsWatched >= REFUND_WATCH_LIMIT_SECONDS) {
    return RefundBlocker.TooMuchWatched;
  }
  return null;
}

/**
 * A purchase made at a purchasing-power price is given back at that price,
 * not at the list price of the course.
 */
export function getRefundAmount(
  purchase: { amountPaid: number; country: string | null },
  listPrice: number
): number {
  return getDiscountForCountry(purchase.country) > 0
    ? purchase.amountPaid
    : listPrice;
}
