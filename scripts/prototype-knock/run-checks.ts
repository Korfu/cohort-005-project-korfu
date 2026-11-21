// PROTOTYPE (throwaway): run the four checks for "Does Knock hold up against Cadence?" (#25).
import {
  ensureDefaultPreferences, identify, knockKeys, knockUserId,
  notifyDiscussionReply, notifyNewEnrollment, signFeedToken,
} from "../../app/lib/knock-prototype.server";

const API = "https://api.knock.app/v1";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const QUESTION_AUTHOR = 9002, REPLIER = 9003, INSTRUCTOR = 9004; // fresh Knock users for a clean run

async function asUser(cadenceId: number, path: string, init: RequestInit = {}) {
  const token = await signFeedToken(cadenceId);
  const res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${knockKeys.publicKey}`, "X-Knock-User-Token": token, "Content-Type": "application/json" } });
  return { status: res.status, body: await res.json().catch(() => null) as any };
}
const feedOf = (id: number) => asUser(id, `/users/${knockUserId(id)}/feeds/${knockKeys.feedChannelId}`);
const meta = (f: any) => `total=${f.body.meta.total_count} unread=${f.body.meta.unread_count} unseen=${f.body.meta.unseen_count}`;

await identify({ id: QUESTION_AUTHOR, name: "Question Author", email: "qa@example.test" });
await identify({ id: REPLIER, name: "Replier", email: "re@example.test" });
await identify({ id: INSTRUCTOR, name: "Instructor", email: "in@example.test" });

console.log("\n== Check 2: trigger Discussion Reply -> question author ==");
const run = await notifyDiscussionReply({ questionAuthorId: QUESTION_AUTHOR, replierId: REPLIER, replierName: "Replier", lessonTitle: "Intro lesson", url: "/courses/x/lessons/1#comment-1", replyId: Date.now() });
console.log("trigger:", run);
await sleep(4000);
let f = await feedOf(QUESTION_AUTHOR);
console.log("author feed:", f.status, meta(f));
const item = f.body.entries[0];
console.log("item:", item?.source?.key, "|", item?.blocks?.find((b: any) => b.name === "body")?.rendered?.replace(/\n/g, ""), "| action_url:", item?.blocks?.find((b: any) => b.name === "action_url")?.rendered);
const rf = await feedOf(REPLIER);
console.log("replier feed (should be empty):", meta(rf));

console.log("\n== Check 3: headless feed — seen / read / unread / bulk ==");
let r = await asUser(QUESTION_AUTHOR, `/messages/batch/seen`, { method: "POST", body: JSON.stringify({ message_ids: [item.id] }) });
f = await feedOf(QUESTION_AUTHOR); console.log("mark seen ->", r.status, "|", meta(f));
r = await asUser(QUESTION_AUTHOR, `/messages/batch/read`, { method: "POST", body: JSON.stringify({ message_ids: [item.id] }) });
f = await feedOf(QUESTION_AUTHOR); console.log("mark read ->", r.status, "|", meta(f));
r = await asUser(QUESTION_AUTHOR, `/messages/batch/unread`, { method: "POST", body: JSON.stringify({ message_ids: [item.id] }) });
f = await feedOf(QUESTION_AUTHOR); console.log("mark unread ->", r.status, "|", meta(f));
r = await asUser(QUESTION_AUTHOR, `/channels/${knockKeys.feedChannelId}/messages/bulk/read`, { method: "POST", body: JSON.stringify({ user_ids: [knockUserId(QUESTION_AUTHOR)] }) });
console.log("bulk mark-all read ->", r.status, r.body?.code ?? r.body?.status ?? "");
await sleep(3000);
f = await feedOf(QUESTION_AUTHOR); console.log("after bulk |", meta(f));
r = await asUser(REPLIER, `/messages/batch/read`, { method: "POST", body: JSON.stringify({ message_ids: [item.id] }) });
console.log("replier marking AUTHOR's message read ->", r.status, JSON.stringify(r.body).slice(0, 120));
r = await asUser(REPLIER, `/channels/${knockKeys.feedChannelId}/messages/bulk/read`, { method: "POST", body: JSON.stringify({ user_ids: [knockUserId(QUESTION_AUTHOR)] }) });
console.log("replier bulk-reading AUTHOR's feed ->", r.status, JSON.stringify(r.body).slice(0, 120));

console.log("\n== Check 4: new Enrollment -> Instructor is off by default, opt-in ==");
const p0 = await ensureDefaultPreferences(INSTRUCTOR);
console.log("default prefs written:", JSON.stringify(p0.categories));
await notifyNewEnrollment({ instructorId: INSTRUCTOR, studentName: "Stu", courseTitle: "Course A" });
await sleep(4000);
f = await feedOf(INSTRUCTOR); console.log("instructor feed while OFF:", meta(f));
r = await asUser(INSTRUCTOR, `/users/${knockUserId(INSTRUCTOR)}/preferences/default`, { method: "PUT", body: JSON.stringify({ __persistence_strategy__: "merge", categories: { enrollments: { channel_types: { in_app_feed: true } } } }) });
console.log("instructor opts in with own token ->", r.status, JSON.stringify(r.body?.categories));
await notifyNewEnrollment({ instructorId: INSTRUCTOR, studentName: "Stu 2", courseTitle: "Course A" });
await sleep(4000);
f = await feedOf(INSTRUCTOR); console.log("instructor feed after opt-in:", meta(f), "|", f.body.entries.map((e: any) => e.data?.student_name).join(","));
r = await asUser(REPLIER, `/users/${knockUserId(INSTRUCTOR)}/preferences/default`, { method: "PUT", body: JSON.stringify({ categories: { enrollments: false } }) });
console.log("replier changing INSTRUCTOR's prefs ->", r.status);
// does a Discussion Reply still reach the instructor (other categories unaffected)?
await notifyDiscussionReply({ questionAuthorId: INSTRUCTOR, replierId: REPLIER, replierName: "Replier", lessonTitle: "L", url: "/", replyId: Date.now() });
await sleep(4000);
f = await feedOf(INSTRUCTOR); console.log("instructor still gets discussions:", meta(f));
