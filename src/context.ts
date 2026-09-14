/**
 * The workflow facts GitHub exposes to an action, and the alert defaults
 * derived from them.
 *
 * Everything is read from the environment GitHub populates for every step, so
 * the action needs no API call and no extra permissions.
 */

/** The subset of the workflow environment this action reads. */
export interface WorkflowEnv {
  GITHUB_REPOSITORY?: string | undefined;
  GITHUB_WORKFLOW?: string | undefined;
  GITHUB_JOB?: string | undefined;
  GITHUB_RUN_ID?: string | undefined;
  GITHUB_RUN_NUMBER?: string | undefined;
  GITHUB_RUN_ATTEMPT?: string | undefined;
  GITHUB_REF_NAME?: string | undefined;
  GITHUB_SHA?: string | undefined;
  GITHUB_ACTOR?: string | undefined;
  GITHUB_EVENT_NAME?: string | undefined;
  GITHUB_SERVER_URL?: string | undefined;
}

/** What the action knows about the run it is reporting on. */
export interface WorkflowContext {
  repository: string;
  workflow: string;
  job: string;
  runNumber: string;
  refName: string;
  shortSha: string;
  actor: string;
  eventName: string;
  runUrl: string;
}

function value(raw: string | undefined, fallback: string): string {
  // A blank variable falls back too, which nullish coalescing alone would not do.
  const trimmed = raw?.trim() ?? "";
  return trimmed === "" ? fallback : trimmed;
}

/** Reads the workflow context, filling in placeholders outside Actions. */
export function readContext(env: WorkflowEnv): WorkflowContext {
  const repository = value(env.GITHUB_REPOSITORY, "unknown/unknown");
  const runId = value(env.GITHUB_RUN_ID, "");
  const server = value(env.GITHUB_SERVER_URL, "https://github.com");
  const attempt = value(env.GITHUB_RUN_ATTEMPT, "");

  let runUrl = "";
  if (runId) {
    runUrl = `${server}/${repository}/actions/runs/${runId}`;
    if (attempt && attempt !== "1") runUrl += `/attempts/${attempt}`;
  }

  return {
    repository,
    workflow: value(env.GITHUB_WORKFLOW, "workflow"),
    job: value(env.GITHUB_JOB, ""),
    runNumber: value(env.GITHUB_RUN_NUMBER, ""),
    refName: value(env.GITHUB_REF_NAME, ""),
    shortSha: value(env.GITHUB_SHA, "").slice(0, 7),
    actor: value(env.GITHUB_ACTOR, ""),
    eventName: value(env.GITHUB_EVENT_NAME, ""),
    runUrl,
  };
}

/**
 * The deduplication key used when the caller supplies none.
 *
 * ITOC360 groups events sharing a fingerprint into one alert, so this has to
 * stay identical between the run that raises the alert and the later run that
 * clears it. Repository, workflow and branch satisfy that; the run id would
 * not, because it changes every time.
 */
export function defaultFingerprint(context: WorkflowContext): string {
  return `${context.repository}::${context.workflow}::${context.refName}`;
}

/**
 * The alert title used when the caller supplies none.
 *
 * The action is almost always guarded by `if: failure()`, so the raising case
 * reads as a failure. Pass the `title` input for anything else.
 */
export function defaultTitle(context: WorkflowContext, resolving: boolean): string {
  const verb = resolving ? "recovered" : "failed";
  const where = context.refName ? ` on ${context.refName}` : "";
  return `${context.workflow} ${verb}${where}`;
}

/** The alert body used when the caller supplies none. */
export function defaultMessage(context: WorkflowContext): string {
  const lines: string[] = [`Repository: ${context.repository}`];

  const run = context.runNumber
    ? `${context.workflow} · run #${context.runNumber}`
    : context.workflow;
  lines.push(`Workflow: ${run}`);

  if (context.job) lines.push(`Job: ${context.job}`);
  if (context.refName) lines.push(`Branch: ${context.refName}`);
  if (context.shortSha) lines.push(`Commit: ${context.shortSha}`);

  if (context.actor) {
    const trigger = context.eventName
      ? `${context.eventName} by ${context.actor}`
      : context.actor;
    lines.push(`Triggered: ${trigger}`);
  }

  if (context.runUrl) lines.push(`Run: ${context.runUrl}`);

  return lines.join("\n");
}
