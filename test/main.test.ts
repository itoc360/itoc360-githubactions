import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { run } from "../src/main.js";
import { startFakeEventsApi, SUCCESS_BODY, type FakeEventsApi } from "./server.js";

let api: FakeEventsApi;
let outputDir: string;
const saved = { ...process.env };

const TOKEN = "itoc-test-token-do-not-use";

/** Sets the environment GitHub would give a step. */
function setInputs(inputs: Record<string, string>): void {
  for (const [name, value] of Object.entries(inputs)) {
    process.env[`INPUT_${name.toUpperCase()}`] = value;
  }
}

function outputs(): Record<string, string> {
  const raw = readFileSync(process.env.GITHUB_OUTPUT ?? "", "utf8");
  const result: Record<string, string> = {};
  // The file uses the heredoc form: name<<DELIM \n value \n DELIM
  const pattern = /^(.+?)<<(\S+)\n([\s\S]*?)\n\2$/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    if (match[1] && match[3] !== undefined) result[match[1]] = match[3];
  }
  return result;
}

beforeEach(async () => {
  api = await startFakeEventsApi();
  outputDir = mkdtempSync(join(tmpdir(), "itoc360-action-"));

  for (const key of Object.keys(process.env)) {
    if (key.startsWith("INPUT_") || key.startsWith("GITHUB_")) {
      Reflect.deleteProperty(process.env, key);
    }
  }

  process.env.GITHUB_OUTPUT = join(outputDir, "output");
  writeFileSync(process.env.GITHUB_OUTPUT, "");

  process.env.GITHUB_REPOSITORY = "itoc360/itoc360-action";
  process.env.GITHUB_WORKFLOW = "CI";
  process.env.GITHUB_RUN_ID = "34357905198";
  process.env.GITHUB_RUN_NUMBER = "42";
  process.env.GITHUB_REF_NAME = "main";
  process.env.GITHUB_SHA = "a9ded5e1234567890";
  process.env.GITHUB_ACTOR = "talhabektas";
  process.env.GITHUB_EVENT_NAME = "push";

  setInputs({ token: TOKEN, "base-url": api.url });
  process.exitCode = undefined;
});

afterEach(async () => {
  await api.close();
  rmSync(outputDir, { recursive: true, force: true });
  process.env = { ...saved };
  process.exitCode = undefined;
});

describe("run", () => {
  it("raises an alert with defaults derived from the workflow", async () => {
    await run();

    expect(process.exitCode).toBeUndefined();
    expect(api.requests).toHaveLength(1);

    const request = api.requests[0];
    expect(request?.method).toBe("POST");
    expect(request?.path).toBe("/functions/v1/events");
    expect(request?.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(request?.headers["user-agent"]).toMatch(/^itoc360-action\//);

    const body = request?.json() as Record<string, unknown>;
    expect(body.status).toBe("trigger");
    expect(body.severity).toBe("high");
    expect(body.id).toBe("itoc360/itoc360-action::CI::main");
    expect(body.title).toBe("CI failed on main");
    expect(String(body.message)).toContain("run #42");

    expect(outputs()).toEqual({
      "event-id": SUCCESS_BODY.id,
      "event-type": SUCCESS_BODY.type,
    });
  });

  it("resolves with the same fingerprint the alert used", async () => {
    setInputs({ status: "resolve" });
    await run();

    const body = api.requests[0]?.json() as Record<string, unknown>;
    expect(body.status).toBe("resolve");
    // Identical to the raising case, or ITOC360 would never close the alert.
    expect(body.id).toBe("itoc360/itoc360-action::CI::main");
    expect(body.title).toBe("CI recovered on main");
  });

  it("lets the caller override every field", async () => {
    setInputs({
      status: "alert",
      severity: "critical",
      title: "Payment API is down",
      message: "latency above 4s",
      fingerprint: "payments::latency",
    });
    await run();

    expect(api.requests[0]?.json()).toEqual({
      id: "payments::latency",
      title: "Payment API is down",
      status: "trigger",
      severity: "critical",
      message: "latency above 4s",
    });
  });

  it("rejects a severity ITOC360 cannot map", async () => {
    setInputs({ severity: "warning" });
    await run();

    expect(process.exitCode).toBe(1);
    expect(api.requests).toHaveLength(0);
  });

  it("rejects an unknown status", async () => {
    setInputs({ status: "firing" });
    await run();

    expect(process.exitCode).toBe(1);
    expect(api.requests).toHaveLength(0);
  });

  it("fails the step when ITOC360 rejects the token", async () => {
    api.status = 401;
    api.body = { error: "Unauthorized" };

    await run();
    expect(process.exitCode).toBe(1);
  });

  it("keeps a delivery failure from failing the workflow when asked", async () => {
    api.status = 500;
    api.body = { error: "Internal Server Error" };
    setInputs({ "fail-on-error": "false" });

    await run();
    expect(process.exitCode).toBeUndefined();
  });

  it("fails when the token is blank", async () => {
    setInputs({ token: "   " });
    await run();

    expect(process.exitCode).toBe(1);
    expect(api.requests).toHaveLength(0);
  });

  it("never writes the token into an output", async () => {
    api.status = 401;
    api.body = { error: "Unauthorized" };
    await run();

    const raw = readFileSync(process.env.GITHUB_OUTPUT ?? "", "utf8");
    expect(raw).not.toContain(TOKEN);
  });
});
