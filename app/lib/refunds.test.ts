import { describe, it, expect } from "vitest";
import {
  findRefundBlocker,
  getRefundAmount,
  isWithinRefundPeriod,
  lastDayOfRefundPeriod,
  RefundBlocker,
  REFUND_COMPLETION_LIMIT,
  REFUND_PERIOD_DAYS,
  REFUND_WATCH_LIMIT_SECONDS,
  type RefundFacts,
} from "./refunds";

const PURCHASED_AT = new Date(2026, 0, 10, 23, 0).toISOString();
const DAY_AFTER_PURCHASE = new Date(2026, 0, 11, 9, 0);
const LESSON_COUNT = 10;

function facts(overrides: Partial<RefundFacts> = {}): RefundFacts {
  return {
    purchasedAt: PURCHASED_AT,
    hasRequestedRefund: false,
    hasClaimedLicense: false,
    lessonCount: LESSON_COUNT,
    completedLessonCount: 0,
    secondsWatched: 0,
    ...overrides,
  };
}

function daysAfterPurchase(days: number, hour: number): Date {
  const when = new Date(PURCHASED_AT);
  when.setDate(when.getDate() + days);
  when.setHours(hour, 0, 0, 0);
  return when;
}

describe("Refund Period", () => {
  it("includes the whole last calendar day, even for a late-night purchase", () => {
    const lastDayLateEvening = daysAfterPurchase(REFUND_PERIOD_DAYS, 23);
    expect(isWithinRefundPeriod(PURCHASED_AT, lastDayLateEvening)).toBe(true);
  });

  it("ends the day after its last day", () => {
    const dayAfterLast = daysAfterPurchase(REFUND_PERIOD_DAYS + 1, 0);
    expect(isWithinRefundPeriod(PURCHASED_AT, dayAfterLast)).toBe(false);
  });

  it("names its last day as a calendar date", () => {
    expect(lastDayOfRefundPeriod(PURCHASED_AT)).toBe("2026-01-24");
  });
});

describe("findRefundBlocker", () => {
  it("lets a fresh purchase be refunded", () => {
    expect(findRefundBlocker(facts(), DAY_AFTER_PURCHASE)).toBeNull();
  });

  it("blocks a second request while one is still requested", () => {
    expect(
      findRefundBlocker(facts({ hasRequestedRefund: true }), DAY_AFTER_PURCHASE)
    ).toBe(RefundBlocker.AlreadyRequested);
  });

  it("blocks a team purchase once one of its licenses is claimed", () => {
    expect(
      findRefundBlocker(facts({ hasClaimedLicense: true }), DAY_AFTER_PURCHASE)
    ).toBe(RefundBlocker.LicenseClaimed);
  });

  it("blocks once the Refund Period is over", () => {
    expect(
      findRefundBlocker(facts(), daysAfterPurchase(REFUND_PERIOD_DAYS + 1, 0))
    ).toBe(RefundBlocker.RefundPeriodOver);
  });

  it("blocks once half the lessons are completed", () => {
    const halfTheLessons = LESSON_COUNT * REFUND_COMPLETION_LIMIT;
    expect(
      findRefundBlocker(
        facts({ completedLessonCount: halfTheLessons }),
        DAY_AFTER_PURCHASE
      )
    ).toBe(RefundBlocker.TooMuchCompleted);
    expect(
      findRefundBlocker(
        facts({ completedLessonCount: halfTheLessons - 1 }),
        DAY_AFTER_PURCHASE
      )
    ).toBeNull();
  });

  it("ignores completion for a course with no lessons", () => {
    expect(
      findRefundBlocker(facts({ lessonCount: 0 }), DAY_AFTER_PURCHASE)
    ).toBeNull();
  });

  it("blocks once the watch limit is reached", () => {
    expect(
      findRefundBlocker(
        facts({ secondsWatched: REFUND_WATCH_LIMIT_SECONDS }),
        DAY_AFTER_PURCHASE
      )
    ).toBe(RefundBlocker.TooMuchWatched);
  });
});

describe("getRefundAmount", () => {
  const LIST_PRICE = 10000;
  const PPP_PRICE = 4000;

  it("refunds a purchasing-power purchase at the price paid", () => {
    expect(
      getRefundAmount({ amountPaid: PPP_PRICE, country: "IN" }, LIST_PRICE)
    ).toBe(PPP_PRICE);
  });

  it("refunds a full-price purchase at the list price", () => {
    expect(
      getRefundAmount({ amountPaid: LIST_PRICE, country: "US" }, LIST_PRICE)
    ).toBe(LIST_PRICE);
  });
});
