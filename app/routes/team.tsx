import { useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/team";
import { getCurrentUserId } from "~/lib/session";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Users, BookOpen, Copy, Check, AlertTriangle } from "lucide-react";
import { data, isRouteErrorResponse } from "react-router";
import { db } from "~/db";
import {
  teams,
  teamMembers,
  coupons,
  courses,
  users,
  TeamMemberRole,
} from "~/db/schema";
import { eq, and } from "drizzle-orm";

function getTeamForAdmin(userId: number) {
  const membership = db
    .select()
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.userId, userId),
        eq(teamMembers.role, TeamMemberRole.Admin)
      )
    )
    .get();

  if (!membership) return undefined;

  return db.select().from(teams).where(eq(teams.id, membership.teamId)).get();
}

function getLicensesForTeam(teamId: number) {
  return db.select().from(coupons).where(eq(coupons.teamId, teamId)).all();
}

function getCourseById(id: number) {
  return db.select().from(courses).where(eq(courses.id, id)).get();
}

function getUserById(id: number) {
  return db.select().from(users).where(eq(users.id, id)).get();
}

interface CourseStats {
  courseId: number;
  courseTitle: string;
  courseSlug: string;
  totalLicenses: number;
  claimedLicenses: number;
}

interface LicenseRow {
  id: number;
  code: string;
  courseId: number;
  courseTitle: string;
  redeemedByEmail: string | null;
  createdAt: string;
}

export function meta() {
  return [
    { title: "Team — Cadence" },
    { name: "description", content: "Manage your team's course licenses" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel.", { status: 401 });
  }

  const team = getTeamForAdmin(currentUserId);

  if (!team) {
    throw data("You don't have a team. Purchase team licenses to create one.", {
      status: 403,
    });
  }

  const allLicenses = getLicensesForTeam(team.id);

  // Build per-course stats
  const courseMap = new Map<
    number,
    {
      courseId: number;
      courseTitle: string;
      courseSlug: string;
      total: number;
      claimed: number;
    }
  >();

  for (const license of allLicenses) {
    if (!courseMap.has(license.courseId)) {
      const course = getCourseById(license.courseId);
      courseMap.set(license.courseId, {
        courseId: license.courseId,
        courseTitle: course?.title ?? "Unknown Course",
        courseSlug: course?.slug ?? "",
        total: 0,
        claimed: 0,
      });
    }
    const entry = courseMap.get(license.courseId)!;
    entry.total++;
    if (license.redeemedByUserId !== null) {
      entry.claimed++;
    }
  }

  const courseStats: CourseStats[] = Array.from(courseMap.values()).map(
    (e) => ({
      courseId: e.courseId,
      courseTitle: e.courseTitle,
      courseSlug: e.courseSlug,
      totalLicenses: e.total,
      claimedLicenses: e.claimed,
    })
  );

  // Build license rows with redeemer email
  const licenseRows: LicenseRow[] = allLicenses.map((license) => {
    let redeemedByEmail: string | null = null;
    if (license.redeemedByUserId !== null) {
      const user = getUserById(license.redeemedByUserId);
      redeemedByEmail = user?.email ?? null;
    }
    const course = getCourseById(license.courseId);
    return {
      id: license.id,
      code: license.code,
      courseId: license.courseId,
      courseTitle: course?.title ?? "Unknown Course",
      redeemedByEmail,
      createdAt: license.createdAt,
    };
  });

  return { courseStats, licenseRows };
}

function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const url = `${window.location.origin}/redeem/${code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
      title="Copy redemption link"
    >
      {copied ? (
        <>
          <Check className="size-3" />
          Copied
        </>
      ) : (
        <>
          <Copy className="size-3" />
          Copy link
        </>
      )}
    </button>
  );
}

export default function Team({ loaderData }: Route.ComponentProps) {
  const { courseStats, licenseRows } = loaderData;
  const [courseFilter, setCourseFilter] = useState<number | "all">("all");

  const filteredLicenses =
    courseFilter === "all"
      ? licenseRows
      : licenseRows.filter((c) => c.courseId === courseFilter);

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Team</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">Team Management</h1>
        <p className="mt-1 text-muted-foreground">
          Manage your team&apos;s course licenses
        </p>
      </div>

      {/* Per-course stats */}
      {courseStats.length > 0 && (
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courseStats.map((stat) => (
            <Card key={stat.courseId}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <BookOpen className="size-4 text-muted-foreground" />
                  <h3 className="font-semibold truncate">{stat.courseTitle}</h3>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold">
                      {stat.claimedLicenses}
                      <span className="text-base font-normal text-muted-foreground">
                        {" "}
                        / {stat.totalLicenses}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      licenses claimed
                    </p>
                  </div>
                  <Link to={`/courses/${stat.courseSlug}/purchase?mode=team`}>
                    <Button variant="outline" size="sm">
                      Buy more licenses
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* License list */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Licenses</h2>
          {courseStats.length > 1 && (
            <select
              value={courseFilter}
              onChange={(e) =>
                setCourseFilter(
                  e.target.value === "all" ? "all" : Number(e.target.value)
                )
              }
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            >
              <option value="all">All courses</option>
              {courseStats.map((stat) => (
                <option key={stat.courseId} value={stat.courseId}>
                  {stat.courseTitle}
                </option>
              ))}
            </select>
          )}
        </div>

        {filteredLicenses.length === 0 ? (
          <p className="text-sm text-muted-foreground">No licenses yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Code</th>
                  <th className="px-4 py-3 text-left font-medium">Course</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredLicenses.map((license) => (
                  <tr key={license.id} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <code className="rounded bg-muted px-2 py-0.5 text-xs">
                        {license.code}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {license.courseTitle}
                    </td>
                    <td className="px-4 py-3">
                      {license.redeemedByEmail ? (
                        <span className="text-muted-foreground">
                          Claimed by {license.redeemedByEmail}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          Unclaimed
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {!license.redeemedByEmail && (
                        <CopyButton code={license.code} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 401) {
      title = "Sign in required";
      message =
        typeof error.data === "string"
          ? error.data
          : "Please select a user from the DevUI panel.";
    } else if (error.status === 403) {
      title = "No team found";
      message =
        typeof error.data === "string"
          ? error.data
          : "You don't have a team yet.";
    } else {
      title = `Error ${error.status}`;
      message = typeof error.data === "string" ? error.data : error.statusText;
    }
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/">
            <Button>Go Home</Button>
          </Link>
          <Link to="/courses">
            <Button variant="outline">Browse Courses</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
