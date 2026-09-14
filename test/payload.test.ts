import { describe, expect, it } from "vitest";

import { buildPayload, isSeverity, normaliseStatus } from "../src/payload.js";

describe("isSeverity", () => {
  it.each(["critical", "high", "medium", "low"])("accepts %s", (value) => {
    expect(isSeverity(value)).toBe(true);
  });

  it.each(["error", "warning", "info", "CRITICAL", ""])("rejects %j", (value) => {
    // ITOC360 maps critical/high/medium/low; anything else leaves the alert
    // without a priority, so the action rejects it up front.
    expect(isSeverity(value)).toBe(false);
  });
});

describe("normaliseStatus", () => {
  it("accepts the friendly spelling", () => {
    expect(normaliseStatus("alert")).toBe("alert");
    expect(normaliseStatus("resolve")).toBe("resolve");
  });

  it("accepts the wording the endpoint uses", () => {
    expect(normaliseStatus("trigger")).toBe("alert");
  });

  it.each(["", "firing", "ALERT", "close"])("rejects %j", (value) => {
    expect(normaliseStatus(value)).toBeNull();
  });
});

describe("buildPayload", () => {
  const fields = {
    fingerprint: "a/b::CI::main",
    title: "CI failed on main",
    severity: "critical",
    message: "details",
  } as const;

  it("sends the deduplication key as id", () => {
    const payload = buildPayload({ ...fields, status: "alert" });
    expect(payload.id).toBe("a/b::CI::main");
  });

  it("maps alert to the trigger status the endpoint expects", () => {
    expect(buildPayload({ ...fields, status: "alert" }).status).toBe("trigger");
  });

  it("maps resolve through unchanged", () => {
    expect(buildPayload({ ...fields, status: "resolve" }).status).toBe("resolve");
  });

  it("carries every field the schema reads", () => {
    const payload = buildPayload({ ...fields, status: "alert" });

    expect(payload).toEqual({
      id: "a/b::CI::main",
      title: "CI failed on main",
      status: "trigger",
      severity: "critical",
      message: "details",
    });
  });
});
