// worker/views/study/today.tsx
//
// The first screen after signing in. Answers "what should I do now?" before
// anything else, then "what's coming?", then "where was I?".

import type { SelectSemester } from "@server/schema/semester.schema";
import type { SelectAssignment, SelectExam } from "@server/schema/assessment.schema";
import type { SelectStudySession } from "@server/schema/study-session.schema";
import type { LinkItemType } from "@server/schema/content-link.schema";
import { sessionMinutes, type AboutLabel } from "@server/services/study.service";
import { daysUntil } from "@server/lib/dates";
import { DueLine, STATUS_LABEL, type SubjectLite } from "./assessments";
import { SessionCard } from "./planner";
import { BTN_OUTLINE, BTN_PRIMARY, CARD, EmptyState, ProgressBar, Section } from "./ui";
import { StarJasmine } from "./florals";
import { formatDay, formatMinutes, formatTime, formatWeekday } from "./format";

export interface RecentItem {
  type: LinkItemType;
  id: number;
  title: string;
  updatedAt: string;
  href: string;
}

interface TodayProps {
  name: string;
  hour: number;
  today: string;
  weekStart: string;
  locale: string;
  semester: SelectSemester | null;
  hasSubjects: boolean;
  subjects: Map<number, SubjectLite>;
  weekSessions: SelectStudySession[];
  aboutOf: (s: SelectStudySession) => AboutLabel | undefined;
  assignments: SelectAssignment[];
  exams: SelectExam[];
  recent: RecentItem[];
  learningCards: number;
}

const greeting = (hour: number) =>
  hour < 5
    ? "Burning the midnight oil"
    : hour < 12
      ? "Good morning"
      : hour < 17
        ? "Good afternoon"
        : hour < 21
          ? "Good evening"
          : "Winding down";

const RECENT_ICON: Record<LinkItemType, string> = {
  note: "notebook-pen",
  resource: "link",
  flashcard_set: "layers",
};

const QUICK_ACTIONS = [
  { href: "/planner/new", icon: "calendar-plus", label: "Plan a session" },
  { href: "/notes/new", icon: "notebook-pen", label: "Write a note" },
  { href: "/assignments/new", icon: "clipboard-list", label: "Add assignment" },
  { href: "/flashcards", icon: "layers", label: "Study flashcards" },
  { href: "/resources/new", icon: "link", label: "Save a link" },
];

export const TodayPage = (p: TodayProps) => {
  const hello = greeting(p.hour);
  const firstName = p.name.split(/[\s@]/)[0];
  const todays = p.weekSessions.filter((s) => s.date === p.today);
  const todayLeft = todays.filter((s) => s.status === "planned").length;
  const weekCounted = p.weekSessions.filter((s) => s.status !== "skipped");
  const weekDone = weekCounted.filter((s) => s.status === "done");
  const minutes = weekDone.reduce((sum, s) => sum + sessionMinutes(s), 0);
  const overdue = p.assignments.filter((a) => daysUntil(a.dueDate, p.today) < 0).length;

  const semesterWeek =
    p.semester && p.today >= p.semester.startDate && p.today <= p.semester.endDate
      ? Math.floor(-daysUntil(p.semester.startDate, p.today) / 7) + 1
      : null;

  return (
    <div class="mx-auto w-full max-w-5xl space-y-10 px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      {/* The one bold moment in the app: the greeting set large in the display
          face, underlined by a long jasmine garland that grows in from the
          left. On a phone the garland keeps its size and shows its first
          stretch rather than shrinking to a thread. */}
      <header>
        <div class="min-w-0 max-w-2xl space-y-3">
          <p class="text-lg text-muted-foreground">
            {formatWeekday(p.today, p.locale)} {formatDay(p.today, p.locale).replace(/^\S+\s/, "")}
            {p.semester && semesterWeek ? `, week ${semesterWeek} of ${p.semester.name}` : ""}
          </p>
          <h1 class="font-serif text-[2.25rem] leading-[1.05] text-balance sm:text-6xl">
            {hello}
            {firstName ? `, ${firstName}` : ""}.
          </h1>
          <p class="max-w-xl text-lg leading-snug">
            {!p.semester
              ? "Start by adding your semester, and the rest of the book fills in from there."
              : todays.length === 0
                ? "Nothing is planned for today."
                : todayLeft === 0
                  ? "Everything planned for today is done."
                  : `${todayLeft === 1 ? "One session" : `${todayLeft} sessions`} left today.`}
            {overdue
              ? ` ${overdue === 1 ? "One assignment is" : `${overdue} assignments are`} overdue.`
              : ""}
          </p>
        </div>
        <StarJasmine class="-mx-2 mt-4 block h-24 w-[calc(100%+1rem)] sm:aspect-[1000/150] sm:h-auto" />
      </header>

      {!p.semester || !p.hasSubjects ? (
        <div class={`${CARD} space-y-4 p-6`}>
          <h2 class="font-serif text-[1.35rem]">Getting started</h2>
          <ol class="space-y-3 text-sm">
            <li class="flex items-center gap-3">
              <span
                class={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${p.semester ? "bg-success text-success-foreground" : "bg-primary/10 text-primary"}`}
              >
                {p.semester ? <i data-lucide="check" class="h-4 w-4"></i> : "1"}
              </span>
              <span class="flex-1">Create a semester with its start and end dates</span>
              {!p.semester ? (
                <a href="/semesters/new" class={BTN_PRIMARY}>
                  Create
                </a>
              ) : null}
            </li>
            <li class="flex items-center gap-3">
              <span
                class={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${p.hasSubjects ? "bg-success text-success-foreground" : "bg-primary/10 text-primary"}`}
              >
                {p.hasSubjects ? <i data-lucide="check" class="h-4 w-4"></i> : "2"}
              </span>
              <span class="flex-1">Add the subjects you're taking</span>
              {p.semester && !p.hasSubjects ? (
                <a href="/subjects/new" class={BTN_PRIMARY}>
                  Add
                </a>
              ) : null}
            </li>
            <li class="flex items-center gap-3">
              <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                3
              </span>
              <span class="flex-1 text-muted-foreground">
                Then assignments, exams, notes and a study plan fall into place
              </span>
            </li>
          </ol>
        </div>
      ) : null}

      <div class="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div class="min-w-0 space-y-8">
          <Section
            title="Today's study"
            icon="calendar-check"
            action={
              <a href={`/planner/new?date=${p.today}`} class={BTN_OUTLINE}>
                <i data-lucide="plus" class="h-4 w-4"></i> Add
              </a>
            }
          >
            {todays.length ? (
              <div class="space-y-2">
                {todays.map((s) => (
                  <SessionCard s={s} about={p.aboutOf(s)} locale={p.locale} />
                ))}
              </div>
            ) : (
              <EmptyState
                compact
                icon="coffee"
                title="A clear day"
                body="Plan a session, or just enjoy the quiet."
              />
            )}
          </Section>

          <Section
            title="Coming up"
            icon="alarm-clock"
            action={
              <a href="/assignments" class="text-sm text-muted-foreground hover:text-primary">
                All deadlines
              </a>
            }
          >
            {p.assignments.length === 0 && p.exams.length === 0 ? (
              <EmptyState
                compact
                icon="sparkles"
                title="Nothing due soon"
                body="No deadlines in the next two weeks."
              />
            ) : (
              <div class={`${CARD} divide-y overflow-hidden`}>
                {[
                  ...p.assignments.map((a) => ({
                    key: `a${a.id}`,
                    date: a.dueDate,
                    line: (
                      <DueLine
                        href={`/assignments#assignment-${a.id}`}
                        title={a.title}
                        what={STATUS_LABEL[a.status].toLowerCase()}
                        subject={p.subjects.get(a.subjectId)}
                        date={a.dueDate}
                        today={p.today}
                        locale={p.locale}
                      />
                    ),
                  })),
                  ...p.exams.map((e) => ({
                    key: `e${e.id}`,
                    date: e.date,
                    line: (
                      <DueLine
                        href={`/exams#exam-${e.id}`}
                        title={e.title}
                        what={`exam${e.time ? ` at ${formatTime(e.time, p.locale)}` : ""}`}
                        subject={p.subjects.get(e.subjectId)}
                        date={e.date}
                        today={p.today}
                        locale={p.locale}
                        open={false}
                      />
                    ),
                  })),
                ]
                  .sort((x, y) => x.date.localeCompare(y.date))
                  .map((row) => row.line)}
              </div>
            )}
          </Section>
        </div>

        <aside class="min-w-0 space-y-8">
          <Section title="This week" icon="sprout">
            <div class={`${CARD} space-y-3 p-5`}>
              <p class="text-lg leading-snug">
                {weekCounted.length === 0
                  ? "No sessions planned yet this week."
                  : `${weekDone.length} of ${weekCounted.length} planned sessions done${minutes ? `, ${formatMinutes(minutes)} of study` : ""}.`}
              </p>
              {weekCounted.length ? (
                <ProgressBar
                  value={weekDone.length}
                  max={weekCounted.length}
                  label="Sessions done this week"
                />
              ) : null}
              <a
                href={`/planner?week=${p.weekStart}`}
                class="-ml-3 inline-flex h-11 items-center rounded-full px-3 font-bold text-primary hover:bg-accent"
              >
                Open the planner
              </a>
            </div>
            {p.learningCards ? (
              <a
                href="/flashcards"
                class={`${CARD} flex items-center gap-3 p-4 hover:bg-accent/40`}
              >
                <i data-lucide="layers" class="h-5 w-5 text-primary"></i>
                <span class="text-sm">
                  <span class="font-medium">
                    {p.learningCards} flashcard{p.learningCards === 1 ? "" : "s"}
                  </span>{" "}
                  still to master
                </span>
              </a>
            ) : null}
          </Section>

          <Section title="Quick add" icon="zap">
            <div class="flex flex-wrap gap-2">
              {QUICK_ACTIONS.map((a) => (
                <a href={a.href} class={BTN_OUTLINE}>
                  <i data-lucide={a.icon} class="h-4 w-4 text-primary"></i>
                  {a.label}
                </a>
              ))}
            </div>
          </Section>

          <Section title="Recently edited" icon="history">
            {p.recent.length ? (
              <ul class={`${CARD} p-1`}>
                {p.recent.map((r) => (
                  <li>
                    <a
                      href={r.href}
                      class="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm hover:bg-accent/60"
                    >
                      <i
                        data-lucide={RECENT_ICON[r.type]}
                        class="h-4 w-4 shrink-0 text-muted-foreground"
                      ></i>
                      <span class="truncate">{r.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p class="text-sm text-muted-foreground">
                Notes, links and flashcards you work on will show up here.
              </p>
            )}
          </Section>
        </aside>
      </div>
    </div>
  );
};
