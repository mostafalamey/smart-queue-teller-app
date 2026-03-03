/**
 * Unit tests for api-client.ts
 *
 * Coverage:
 *  - Authorization header attachment
 *  - 401 → silent refresh → retry with new token
 *  - 401 → refresh fails → dispatches auth:unauthorized
 *  - Shared refresh promise for concurrent 401s
 *  - 204 No Content returns undefined
 *  - Timeout (AbortError → TIMEOUT)
 *  - Network error → NETWORK_ERROR
 *  - Typed ApiError parsing from error responses
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ApiClient } from "../api-client";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function makeOkResponse(body: unknown, status = 200): Response {
  return {
    ok: true,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function makeErrResponse(
  body: { code?: string; message?: string },
  status: number,
): Response {
  return {
    ok: false,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function make401(): Response {
  return makeErrResponse({}, 401);
}

function makeClient(
  overrides: Partial<{
    getAccessToken: () => string | null;
    refreshAccessToken: () => Promise<string>;
  }> = {},
): ApiClient {
  return new ApiClient({
    baseUrl: "http://localhost:3000",
    getAccessToken: overrides.getAccessToken ?? (() => "initial-token"),
    refreshAccessToken:
      overrides.refreshAccessToken ??
      (() => Promise.resolve("refreshed-token")),
  });
}

/* -------------------------------------------------------------------------- */
/*  Tests                                                                     */
/* -------------------------------------------------------------------------- */

describe("ApiClient", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  /* ---- Authorization header -------------------------------------------- */

  it("attaches Authorization header from getAccessToken", async () => {
    fetchSpy.mockResolvedValueOnce(makeOkResponse({ data: 1 }));
    const client = makeClient({ getAccessToken: () => "my-token" });

    await client.get("/test");

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer my-token",
    );
  });

  it("omits Authorization header when getAccessToken returns null", async () => {
    fetchSpy.mockResolvedValueOnce(makeOkResponse({ data: 1 }));
    const client = makeClient({ getAccessToken: () => null });

    await client.get("/test");

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(
      (init.headers as Record<string, string>)["Authorization"],
    ).toBeUndefined();
  });

  it("skips Authorization when skipAuth option is true", async () => {
    fetchSpy.mockResolvedValueOnce(makeOkResponse({ ok: true }));
    const client = makeClient();

    await client.get("/public", { skipAuth: true });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(
      (init.headers as Record<string, string>)["Authorization"],
    ).toBeUndefined();
  });

  /* ---- 401 silent refresh + retry --------------------------------------- */

  it("on 401: refreshes token and retries the request with the new token", async () => {
    fetchSpy
      .mockResolvedValueOnce(make401()) // initial request fails
      .mockResolvedValueOnce(makeOkResponse({ retried: true })); // retry succeeds

    const refreshFn = vi.fn().mockResolvedValue("new-token");
    const client = makeClient({ refreshAccessToken: refreshFn });

    const result = await client.get<{ retried: boolean }>("/protected");

    expect(refreshFn).toHaveBeenCalledOnce();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    // Second call should use the refreshed token
    const [, retryInit] = fetchSpy.mock.calls[1] as [string, RequestInit];
    expect(
      (retryInit.headers as Record<string, string>)["Authorization"],
    ).toBe("Bearer new-token");
    expect(result).toEqual({ retried: true });
  });

  it("on 401: dispatches auth:unauthorized when refresh also fails", async () => {
    fetchSpy.mockResolvedValue(make401());
    const refreshFn = vi
      .fn()
      .mockRejectedValue(new Error("refresh rejected"));
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    const client = makeClient({ refreshAccessToken: refreshFn });

    await expect(client.get("/protected")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "auth:unauthorized" }),
    );
  });

  it("does not retry a second time (_isRetry guard prevents loop)", async () => {
    // Both the first call and the retry return 401.
    fetchSpy.mockResolvedValue(make401());
    const refreshFn = vi.fn().mockResolvedValue("new-token");
    const client = makeClient({ refreshAccessToken: refreshFn });

    await expect(client.get("/endpoint")).rejects.toBeDefined();
    // Refresh happens once; no infinite loop
    expect(refreshFn).toHaveBeenCalledOnce();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("shares a single refresh promise for concurrent 401s", async () => {
    // Refresh takes a tick so the second 401 is processed before it resolves.
    const refreshFn = vi
      .fn()
      .mockImplementation(
        () =>
          new Promise<string>((resolve) =>
            setTimeout(() => resolve("shared-token"), 10),
          ),
      );

    fetchSpy.mockImplementation(
      async (_url: string, opts: RequestInit) => {
        const auth =
          (opts.headers as Record<string, string>)?.Authorization ?? "";
        // Initial calls with the original token → 401
        if (auth === "Bearer initial-token") {
          return make401();
        }
        // Retries with refreshed token → 200
        return makeOkResponse({ ok: true });
      },
    );

    const client = makeClient({ refreshAccessToken: refreshFn });
    await Promise.all([client.get("/a"), client.get("/b")]);

    expect(refreshFn).toHaveBeenCalledOnce();
  });

  /* ---- 204 No Content --------------------------------------------------- */

  it("returns undefined for 204 No Content responses", async () => {
    fetchSpy.mockResolvedValueOnce({ ok: true, status: 204 } as Response);
    const client = makeClient();

    const result = await client.post("/action");

    expect(result).toBeUndefined();
  });

  /* ---- Timeout ---------------------------------------------------------- */

  it("throws TIMEOUT when the request is aborted after the timeout window", async () => {
    vi.useFakeTimers();
    fetchSpy.mockImplementationOnce(
      (_url: string, opts: RequestInit) =>
        new Promise((_, reject) => {
          (opts.signal as AbortSignal).addEventListener("abort", () => {
            reject(
              Object.assign(new Error("Aborted"), { name: "AbortError" }),
            );
          });
        }),
    );

    const client = makeClient();
    const req = client.get("/slow");
    req.catch(() => {}); // prevent unhandled-rejection noise before assertion consumes it
    await vi.advanceTimersByTimeAsync(9_000);

    await expect(req).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  /* ---- Network error ---------------------------------------------------- */

  it("throws NETWORK_ERROR when fetch rejects with a network failure", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("socket hang up"));
    const client = makeClient();

    await expect(client.get("/test")).rejects.toMatchObject({
      code: "NETWORK_ERROR",
    });
  });

  /* ---- Typed error parsing ---------------------------------------------- */

  it("parses typed ApiError (code, message, status) from an error response", async () => {
    fetchSpy.mockResolvedValueOnce(
      makeErrResponse({ code: "FORBIDDEN", message: "Access denied" }, 403),
    );
    const client = makeClient();

    await expect(client.get("/admin")).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Access denied",
      status: 403,
    });
  });

  it("falls back to UNKNOWN for an unrecognised error code", async () => {
    fetchSpy.mockResolvedValueOnce(
      makeErrResponse({ code: "FUTURE_ERROR", message: "Unheard of" }, 500),
    );
    const client = makeClient();

    await expect(client.get("/x")).rejects.toMatchObject({ code: "UNKNOWN" });
  });

  it("uses a generic message when the error response body is not valid JSON", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: () => Promise.reject(new SyntaxError("Unexpected token")),
    } as unknown as Response);
    const client = makeClient();

    await expect(client.get("/x")).rejects.toMatchObject({
      message: "Request failed with status 503",
    });
  });

  /* ---- HTTP methods ----------------------------------------------------- */

  it("sends a POST with JSON body", async () => {
    fetchSpy.mockResolvedValueOnce(makeOkResponse({ created: true }));
    const client = makeClient();

    await client.post("/resource", { name: "test" });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ name: "test" });
  });

  it("sends a DELETE without a body", async () => {
    fetchSpy.mockResolvedValueOnce(makeOkResponse({ deleted: true }));
    const client = makeClient();

    await client.delete("/resource/1");

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
  });
});
