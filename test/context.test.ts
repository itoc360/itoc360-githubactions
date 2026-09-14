import { describe, expect, it } from "vitest";

import {
  defaultFingerprint,
  defaultMessage,
  defaultTitle,
  readContext,
  type WorkflowEnv,
} from "../src/context.js";

const ENV: WorkflowEnv = {
  GITHUB_REPOSITORY: "itoc360/itoc360-action",
  GITHUB_WORKFLOW: "CI",
  GITHUB_JOB: "build",
  GITHUB_RUN_ID: "34357905198",
  GITHUB_RUN_NUMBER: "42",
  GITHUB_RUN_ATTEMPT: "1",
  GITHUB_REF_NAME: "main",
  GITHUB_SHA: "a9ded5e1234567890abcdef",
  GITHUB_ACTOR: "talhabektas",
  GITHUB_EVENT_NAME: "push",
  GITHUB_SERVER_URL: "https://github.com",
};

describe("readContext", () => {
  it("reads the workflow environment", () => {
    const context = readContext(ENV);

    expect(context.repository).toBe("itoc360/itoc360-action");
    expect(context.workflow).toBe("CI");
    expect(context.shortSha).toBe("a9ded5e");
    expect(context.runUrl).toBe(
      "https://github.com/itoc360/itoc360-action/actions/runs/34357905198",
    );
  });

  it("links to the attempt when a run was retried", () => {
    const context = readContext({ ...ENV, GITHUB_RUN_ATTEMPT: "3" });
    expect(context.runUrl).toMatch(/\/attempts\/3$/);
  });

  it("falls back to placeholders outside Actions", () => {
    const context = readContext({});

    expect(context.repository).toBe("unknown/unknown");
    expect(context.workflow).toBe("workflow");
    expect(context.runUrl).toBe("");
    expect(context.shortSha).toBe("");
  });

  it("uses a self-hosted server url", () => {
    const context = readContext({
      ...ENV,
      GITHUB_SERVER_URL: "https://git.example.test",
    });
    expect(context.runUrl).toMatch(/^https:\/\/git\.example\.test\//);
  });
});

describe("defaults", () => {
  it("derives a fingerprint that survives across runs", () => {
    // Neither the run id nor the commit may appear, or the resolving run would
    // produce a different key and never close the alert.
    const fingerprint = defaultFingerprint(readContext(ENV));

    expect(fingerprint).toBe("itoc360/itoc360-action::CI::main");
    expect(fingerprint).not.toContain("34357905198");
    expect(fingerprint).not.toContain("a9ded5e");
  });

  it("gives a different fingerprint per branch and workflow", () => {
    const base = defaultFingerprint(readContext(ENV));
    const otherBranch = defaultFingerprint(
      readContext({ ...ENV, GITHUB_REF_NAME: "develop" }),
    );
    const otherWorkflow = defaultFingerprint(
      readContext({ ...ENV, GITHUB_WORKFLOW: "Release" }),
    );

    expect(otherBranch).not.toBe(base);
    expect(otherWorkflow).not.toBe(base);
  });

  it("titles the raising and the clearing event differently", () => {
    const context = readContext(ENV);

    expect(defaultTitle(context, false)).toBe("CI failed on main");
    expect(defaultTitle(context, true)).toBe("CI recovered on main");
  });

  it("describes the run in the message", () => {
    const message = defaultMessage(readContext(ENV));

    expect(message).toContain("Repository: itoc360/itoc360-action");
    expect(message).toContain("run #42");
    expect(message).toContain("Commit: a9ded5e");
    expect(message).toContain("push by talhabektas");
    expect(message).toContain(
      "https://github.com/itoc360/itoc360-action/actions/runs/",
    );
  });

  it("omits the lines it has no value for", () => {
    const message = defaultMessage(readContext({ GITHUB_REPOSITORY: "a/b" }));

    expect(message).toContain("Repository: a/b");
    expect(message).not.toContain("Commit:");
    expect(message).not.toContain("Run:");
  });
});
