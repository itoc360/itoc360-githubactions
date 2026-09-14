import * as core from "@actions/core";
import { APIError, ITOC360, TransportError } from "@itoc360/sdk";

import {
  defaultFingerprint,
  defaultMessage,
  defaultTitle,
  readContext,
} from "./context.js";
import {
  buildPayload,
  isSeverity,
  normaliseStatus,
  SEVERITIES,
  STATUSES,
} from "./payload.js";

/** Reads an input, falling back when the caller left it blank. */
function input(name: string, fallback = ""): string {
  const raw = core.getInput(name).trim();
  return raw === "" ? fallback : raw;
}

/** Reads a boolean input, tolerating the usual spellings. */
function boolInput(name: string, fallback: boolean): boolean {
  const raw = core.getInput(name).trim().toLowerCase();
  if (raw === "") return fallback;
  if (["true", "yes", "1"].includes(raw)) return true;
  if (["false", "no", "0"].includes(raw)) return false;
  throw new Error(`input "${name}" must be true or false, got "${raw}"`);
}

/** Reads a positive integer input. */
function numberInput(name: string, fallback: number): number {
  const raw = core.getInput(name).trim();
  if (raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`input "${name}" must be a positive number, got "${raw}"`);
  }
  return parsed;
}

export async function run(): Promise<void> {
  const failOnError = boolInput("fail-on-error", true);

  try {
    const token = core.getInput("token", { required: true }).trim();
    if (token === "") {
      throw new Error('input "token" is required and must not be empty');
    }
    // Keep the token out of the log even if something later prints it.
    core.setSecret(token);

    const status = normaliseStatus(input("status", "alert"));
    if (status === null) {
      throw new Error(
        `input "status" must be one of ${STATUSES.join(", ")}, got "${core.getInput("status")}"`,
      );
    }

    const severity = input("severity", "high").toLowerCase();
    if (!isSeverity(severity)) {
      throw new Error(
        `input "severity" must be one of ${SEVERITIES.join(", ")}, got "${severity}"`,
      );
    }

    const context = readContext(process.env);
    const resolving = status === "resolve";

    const payload = buildPayload({
      fingerprint: input("fingerprint", defaultFingerprint(context)),
      title: input("title", defaultTitle(context, resolving)),
      status,
      severity,
      message: input("message", defaultMessage(context)),
    });

    const client = new ITOC360({
      token,
      baseUrl: input("base-url", "https://api.itoc360.app"),
      timeout: numberInput("timeout", 10_000),
      userAgent: "itoc360-action/1.0.0",
    });

    core.info(
      `${resolving ? "Resolving" : "Raising"} ITOC360 alert "${payload.title}" ` +
        `(fingerprint: ${payload.id})`,
    );

    const event = await client.sendRaw(payload);

    core.setOutput("event-id", event.id);
    core.setOutput("event-type", event.type);
    core.info(`ITOC360 recorded event ${event.id} as ${event.type}`);
  } catch (error) {
    const message = describe(error);
    if (failOnError) core.setFailed(message);
    else core.warning(`${message} — continuing because fail-on-error is false`);
  }
}

/** Turns an error into the one line a workflow log should show. */
function describe(error: unknown): string {
  if (error instanceof APIError) {
    if (error.unauthorized) {
      return "ITOC360 rejected the token: check that the secret holds a valid source token";
    }
    if (error.subscriptionInactive) {
      return "The ITOC360 subscription for this organization is not active; the alert was dropped";
    }
    return `ITOC360 rejected the alert (HTTP ${String(error.status)}): ${error.detail}`;
  }

  if (error instanceof TransportError) {
    // The SDK already words these as complete sentences about ITOC360.
    return error.message;
  }

  return error instanceof Error ? error.message : String(error);
}
