// PROTOTYPE (throwaway) — spike for "Does Knock hold up against Cadence?" (#25).
// Lives on the prototype/knock-spike branch only. Never merge.
//
// Reads Knock keys straight from the gitignored .env.my so the spike doesn't
// touch .env. Mapping (see the ticket's resolution comment):
//   key2 = in-app feed channel id, key3 = secret key, key6 = public key,
//   signing = base-64 PEM signing key.
import { readFileSync } from "node:fs";
import Knock from "@knocklabs/node";
import { signUserToken } from "@knocklabs/node/lib/tokenSigner";

const ENV_FILE = ".env.my";

function loadKeys() {
  const pairs = readFileSync(ENV_FILE, "utf8")
    .trim()
    .split("\n")
    .map((line) => {
      const eq = line.indexOf("=");
      return [
        line.slice(0, eq).trim(),
        line
          .slice(eq + 1)
          .trim()
          .replace(/^['"]|['"]$/g, ""),
      ];
    });
  const kv = Object.fromEntries(pairs);
  return {
    feedChannelId: kv.key2 as string,
    secretKey: kv.key3 as string,
    publicKey: kv.key6 as string,
    signingKey: kv.signing as string,
  };
}

export const knockKeys = loadKeys();

const knock = new Knock({ apiKey: knockKeys.secretKey });

export const WORKFLOW = {
  discussionReply: "discussion-reply",
  newEnrollment: "new-enrollment",
} as const;

export const CATEGORY = {
  discussions: "discussions",
  enrollments: "enrollments",
} as const;

const IN_APP_FEED = "in_app_feed";
const DEFAULT_PREFERENCE_SET = "default";

export function knockUserId(cadenceUserId: number) {
  return `cadence-${cadenceUserId}`;
}

export function signFeedToken(cadenceUserId: number) {
  return signUserToken(knockUserId(cadenceUserId), {
    signingKey: knockKeys.signingKey,
  });
}

export async function identify(user: { id: number; name: string; email: string }) {
  return knock.users.update(knockUserId(user.id), {
    name: user.name,
    email: user.email,
  });
}

// Check 4: "new Enrollment → Instructor" must be off by default. Knock's own
// default is "everything on", so we write an explicit opt-out for the
// enrollments category the first time we see the user. The user flips it on
// later from the client with their signed token.
export async function ensureDefaultPreferences(cadenceUserId: number) {
  const id = knockUserId(cadenceUserId);
  const existing = await knock.users
    .getPreferences(id, DEFAULT_PREFERENCE_SET)
    .catch(() => null);
  if (existing?.categories && CATEGORY.enrollments in existing.categories) {
    return existing;
  }
  return knock.users.setPreferences(id, DEFAULT_PREFERENCE_SET, {
    __persistence_strategy__: "merge",
    categories: {
      [CATEGORY.enrollments]: { channel_types: { [IN_APP_FEED]: false } },
    },
  });
}

export async function notifyDiscussionReply(args: {
  questionAuthorId: number;
  replierId: number;
  replierName: string;
  lessonTitle: string;
  url: string;
  replyId: number;
}) {
  if (args.questionAuthorId === args.replierId) return null;
  return knock.workflows.trigger(
    WORKFLOW.discussionReply,
    {
      recipients: [knockUserId(args.questionAuthorId)],
      actor: knockUserId(args.replierId),
      data: {
        actor_name: args.replierName,
        lesson_title: args.lessonTitle,
        url: args.url,
      },
    },
    { idempotencyKey: `discussion-reply-${args.replyId}` }
  );
}

export async function notifyNewEnrollment(args: {
  instructorId: number;
  studentName: string;
  courseTitle: string;
}) {
  return knock.workflows.trigger(WORKFLOW.newEnrollment, {
    recipients: [knockUserId(args.instructorId)],
    data: { student_name: args.studentName, course_title: args.courseTitle },
  });
}
