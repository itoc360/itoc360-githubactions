/**
 * The event body ITOC360 receives.
 *
 * The source this action sends to is configured for a provider whose schema is
 * vendor-neutral: a title, a status and an optional deduplication id. That is
 * the shape built here.
 */

/** Urgency values ITOC360 maps to an alert priority. */
export const SEVERITIES = ["critical", "high", "medium", "low"] as const;
export type Severity = (typeof SEVERITIES)[number];

/** What the caller asked the action to do. */
export const STATUSES = ["alert", "resolve"] as const;
export type Status = (typeof STATUSES)[number];

/** The body sent to the events endpoint. */
export interface EventPayload {
  /** Deduplication key. ITOC360 hashes it to group events into one alert. */
  id: string;
  /** One-line alert title, shown in ITOC360 and in notifications. */
  title: string;
  /** `"trigger"` raises or updates the alert, `"resolve"` clears it. */
  status: "trigger" | "resolve";
  /** Mapped to the alert priority. */
  severity: Severity;
  /** Longer description. */
  message: string;
}

/** Reports whether `value` is a severity ITOC360 recognises. */
export function isSeverity(value: string): value is Severity {
  return (SEVERITIES as readonly string[]).includes(value);
}

/**
 * Reports whether `value` is a status this action accepts.
 *
 * `"trigger"` is accepted as well, because that is the wording the endpoint
 * itself uses and someone reading the API docs will reach for it.
 */
export function normaliseStatus(value: string): Status | null {
  if (value === "alert" || value === "trigger") return "alert";
  if (value === "resolve") return "resolve";
  return null;
}

/** Assembles the event body. */
export function buildPayload(fields: {
  fingerprint: string;
  title: string;
  status: Status;
  severity: Severity;
  message: string;
}): EventPayload {
  return {
    id: fields.fingerprint,
    title: fields.title,
    status: fields.status === "resolve" ? "resolve" : "trigger",
    severity: fields.severity,
    message: fields.message,
  };
}
