// PROTOTYPE (throwaway) for "What does the Notification Feed look like in Cadence?" (#23).
// Sends the current DevUI user one Discussion Reply and one new Enrollment through the
// real Knock workflows, so the feed variants have live data. Writes no Cadence rows.
import { data } from "react-router";
import { eq, ne, sql } from "drizzle-orm";
import type { Route } from "./+types/api.prototype-feed-seed";
import { getCurrentUserId } from "~/lib/session";
import { db } from "~/db";
import { courses, lessons, modules, users } from "~/db/schema";
import {
  identify,
  notifyDiscussionReply,
  notifyNewEnrollment,
  setEnrollmentFeedPreference,
} from "~/lib/knock-prototype.server";

export async function action({ request }: Route.ActionArgs) {
  const userId = await getCurrentUserId(request);
  if (!userId) throw data("Select a user from the DevUI panel", { status: 401 });
  const me = db.select().from(users).where(eq(users.id, userId)).get()!;
  const other = db.select().from(users).where(ne(users.id, me.id)).orderBy(sql`random()`).get()!;
  const lesson = db
    .select({ id: lessons.id, title: lessons.title, slug: courses.slug, courseTitle: courses.title })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .orderBy(sql`random()`)
    .get()!;

  try {
    await Promise.all([identify(me), identify(other)]);
    // Enrollment Notifications are opt-in; opt in so the test one shows up.
    await setEnrollmentFeedPreference(me.id, true);
    await notifyDiscussionReply({
      questionAuthorId: me.id,
      replierId: other.id,
      replierName: other.name,
      lessonTitle: lesson.title,
      url: `/courses/${lesson.slug}/lessons/${lesson.id}`,
      replyId: Date.now(),
    });
    await notifyNewEnrollment({ instructorId: me.id, studentName: other.name, courseTitle: lesson.courseTitle });
    return { ok: true, sent: [`reply from ${other.name}`, `enrollment in ${lesson.courseTitle}`] };
  } catch (e: any) {
    return { error: `${e.status ?? ""} ${e.message}` };
  }
}
