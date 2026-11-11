import { data, redirect } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/courses.$slug.refund";
import { getCurrentUserId } from "~/lib/session";
import { db } from "~/db";
import { courses, users } from "~/db/schema";
import { eq } from "drizzle-orm";
import { parseFormData, parseParams } from "~/lib/validation";
import { formatPrice } from "~/lib/utils";
import { REFUND_PERIOD_DAYS, RefundBlocker } from "~/lib/refunds";
import { checkRefund, requestRefund } from "~/lib/refunds.server";

const HTTP_FORBIDDEN = 403;
const HTTP_CONFLICT = 409;

const refundParamsSchema = z.object({
  slug: z.string().min(1),
});

const refundActionSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "Tell us a little more about why you want a refund.")
    .max(1000, "Please keep your reason under 1000 characters."),
});

const BLOCKER_RESPONSES: Record<
  RefundBlocker,
  { message: string; status: number }
> = {
  [RefundBlocker.NoPurchase]: {
    message: "You have not bought this course.",
    status: HTTP_FORBIDDEN,
  },
  [RefundBlocker.AlreadyRequested]: {
    message: "You have already requested a refund for this purchase.",
    status: HTTP_CONFLICT,
  },
  [RefundBlocker.LicenseClaimed]: {
    message:
      "A team purchase cannot be refunded once one of its licenses has been claimed.",
    status: HTTP_FORBIDDEN,
  },
  [RefundBlocker.RefundPeriodOver]: {
    message: `The ${REFUND_PERIOD_DAYS}-day refund period has ended.`,
    status: HTTP_FORBIDDEN,
  },
  [RefundBlocker.TooMuchCompleted]: {
    message: "You have completed too much of this course to get a refund.",
    status: HTTP_FORBIDDEN,
  },
  [RefundBlocker.TooMuchWatched]: {
    message: "You have watched too much of this course to get a refund.",
    status: HTTP_FORBIDDEN,
  },
};

/**
 * The confirmation the learner gets in their inbox. There is no mail
 * transport wired up yet, so the built message goes to the server log.
 */
function buildRefundRequestedEmail(input: {
  learnerName: string;
  learnerEmail: string;
  courseTitle: string;
  amount: number;
}) {
  return {
    to: input.learnerEmail,
    subject: `Refund requested — ${input.courseTitle}`,
    body: [
      `Hi ${input.learnerName},`,
      "",
      `You have requested a refund for "${input.courseTitle}".`,
      `The refund is for ${formatPrice(input.amount)}, the amount you paid.`,
      "",
      "Our team reviews every refund by hand. You do not need to do anything else — we will email you again when it is done.",
      "",
      "— The Cadence team",
    ].join("\n"),
  };
}

export async function action({ params, request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("You must be logged in to request a refund.", { status: 401 });
  }

  const { slug } = parseParams(params, refundParamsSchema);
  const course = db.select().from(courses).where(eq(courses.slug, slug)).get();

  if (!course) {
    throw data("Course not found", { status: 404 });
  }

  const learner = db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .get();

  if (!learner) {
    throw data("User not found", { status: 404 });
  }

  const refund = checkRefund(currentUserId, course);

  if (!refund.ok) {
    const { message, status } = BLOCKER_RESPONSES[refund.blocker];
    throw data(message, { status });
  }

  const formData = await request.formData();
  const parsed = parseFormData(formData, refundActionSchema);

  if (!parsed.success) {
    return data({ errors: parsed.errors }, { status: 400 });
  }

  requestRefund(refund.purchase.id, parsed.data.reason);

  const email = buildRefundRequestedEmail({
    learnerName: learner.name,
    learnerEmail: learner.email,
    courseTitle: course.title,
    amount: refund.amount,
  });

  console.log(
    `[email] to=${email.to} subject=${email.subject}\n${email.body}`
  );

  return redirect("/settings");
}
