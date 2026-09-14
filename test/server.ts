/**
 * A local stand-in for the ITOC360 Events API, so the tests exercise the real
 * request path without contacting ITOC360.
 */
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";

export interface Recorded {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: string;
  json: () => unknown;
}

export interface FakeEventsApi {
  readonly url: string;
  readonly requests: Recorded[];
  status: number;
  body: unknown;
  close: () => Promise<void>;
}

export const SUCCESS_BODY = {
  id: "3f0a1c2e-1111-4222-8333-444455556666",
  type: "ALERT",
  fingerprint: "9c1185a5c5e9fc54612808977ee8f548",
} as const;

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    request.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    request.on("error", reject);
  });
}

export async function startFakeEventsApi(): Promise<FakeEventsApi> {
  const requests: Recorded[] = [];
  const state = { status: 200, body: SUCCESS_BODY as unknown };

  const handle = async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    const body = await readBody(request);
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(request.headers)) {
      if (typeof value === "string") headers[key.toLowerCase()] = value;
    }

    requests.push({
      method: request.method ?? "",
      path: (request.url ?? "").split("?")[0] ?? "",
      headers,
      body,
      json: () => JSON.parse(body) as unknown,
    });

    const payload =
      typeof state.body === "string" ? state.body : JSON.stringify(state.body);
    response.writeHead(state.status, {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload).toString(),
    });
    response.end(payload);
  };

  const server: Server = createServer((request, response) => {
    void handle(request, response);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${String(address.port)}`,
    requests,
    get status() {
      return state.status;
    },
    set status(value: number) {
      state.status = value;
    },
    get body() {
      return state.body;
    },
    set body(value: unknown) {
      state.body = value;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}
