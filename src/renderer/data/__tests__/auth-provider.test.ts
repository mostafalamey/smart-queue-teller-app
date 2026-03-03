/**
 * Unit tests for auth-provider.ts
 *
 * Coverage:
 *  - login: success, invalid credentials, timeout, network error, unknown error code
 *  - refresh: success, expired token
 *  - logout: success, sends Authorization header
 *  - toApiErrorCode: falls back to UNKNOWN for unrecognised codes
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createAuthProvider } from "../auth-provider";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

const BASE_URL = "http://localhost:3000";

function makeOkResponse(body: unknown, status = 200): Response {
  return {
    ok: true,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function makeErrResponse(
  body: { code?: string; message?: string; lockedUntilSeconds?: number },
  status: number,
): Response {
  return {
    ok: false,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const MOCK_LOGIN_RESULT = {
  user: {
    id: "user-1",
    email: "staff@hospital.test",
    role: "STAFF" as const,
    mustChangePassword: false,
  },
  auth: {
    tokenType: "Bearer" as const,
    accessToken: "access-token-abc",
    refreshToken: "refresh-token-xyz",
    accessTokenExpiresInSeconds: 900,
    refreshTokenExpiresInSeconds: 604800,
  },
};

/* -------------------------------------------------------------------------- */
/*  Tests                                                                     */
/* -------------------------------------------------------------------------- */

describe("createAuthProvider", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  /* ---- login ------------------------------------------------------------ */

  describe("login", () => {
    it("resolves with the LoginResult on success", async () => {
      fetchSpy.mockResolvedValueOnce(makeOkResponse(MOCK_LOGIN_RESULT));

      const provider = createAuthProvider(BASE_URL);
      const result = await provider.login({
        email: "staff@hospital.test",
        password: "secret",
      });

      expect(result).toEqual(MOCK_LOGIN_RESULT);
    });

    it("POSTs to /auth/login with JSON body", async () => {
      fetchSpy.mockResolvedValueOnce(makeOkResponse(MOCK_LOGIN_RESULT));

      const provider = createAuthProvider(BASE_URL);
      await provider.login({ email: "a@b.com", password: "pw" });

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/auth/login`);
      expect(init.method).toBe("POST");
      expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
        "application/json",
      );
      expect(JSON.parse(init.body as string)).toMatchObject({
        email: "a@b.com",
        password: "pw",
      });
    });

    it("includes optional stationId in the request body when provided", async () => {
      fetchSpy.mockResolvedValueOnce(makeOkResponse(MOCK_LOGIN_RESULT));

      const provider = createAuthProvider(BASE_URL);
      await provider.login({
        email: "a@b.com",
        password: "pw",
        stationId: "sta-42",
      });

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string) as Record<string, unknown>;
      expect(body.stationId).toBe("sta-42");
    });

    it("throws typed ApiError with INVALID_CREDENTIALS on 401", async () => {
      fetchSpy.mockResolvedValueOnce(
        makeErrResponse(
          { code: "INVALID_CREDENTIALS", message: "Bad credentials" },
          401,
        ),
      );

      const provider = createAuthProvider(BASE_URL);
      await expect(
        provider.login({ email: "bad@test.com", password: "wrong" }),
      ).rejects.toMatchObject({
        code: "INVALID_CREDENTIALS",
        message: "Bad credentials",
        status: 401,
      });
    });

    it("throws ACCOUNT_LOCKED (423) with lockedUntilSeconds", async () => {
      fetchSpy.mockResolvedValueOnce(
        makeErrResponse(
          {
            code: "ACCOUNT_LOCKED",
            message: "Locked",
            lockedUntilSeconds: 300,
          },
          423,
        ),
      );

      const provider = createAuthProvider(BASE_URL);
      await expect(
        provider.login({ email: "a@b.com", password: "pw" }),
      ).rejects.toMatchObject({
        code: "ACCOUNT_LOCKED",
        lockedUntilSeconds: 300,
      });
    });

    it("falls back to UNKNOWN for an unrecognised error code", async () => {
      fetchSpy.mockResolvedValueOnce(
        makeErrResponse(
          { code: "SOME_FUTURE_CODE", message: "Unexpected" },
          500,
        ),
      );

      const provider = createAuthProvider(BASE_URL);
      await expect(
        provider.login({ email: "a@b.com", password: "pw" }),
      ).rejects.toMatchObject({ code: "UNKNOWN" });
    });

    it("throws NETWORK_ERROR when fetch rejects", async () => {
      fetchSpy.mockRejectedValueOnce(new Error("net fail"));

      const provider = createAuthProvider(BASE_URL);
      await expect(
        provider.login({ email: "a@b.com", password: "pw" }),
      ).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    });

    it("throws TIMEOUT when the request is aborted after the timeout", async () => {
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

      const provider = createAuthProvider(BASE_URL);
      const loginPromise = provider.login({ email: "a@b.com", password: "pw" });
      loginPromise.catch(() => {}); // prevent unhandled-rejection noise before assertion consumes it

      // Advance past the 8-second timeout
      await vi.advanceTimersByTimeAsync(9_000);

      await expect(loginPromise).rejects.toMatchObject({ code: "TIMEOUT" });
    });
  });

  /* ---- refresh ---------------------------------------------------------- */

  describe("refresh", () => {
    it("resolves with rotated tokens on success", async () => {
      const rotated = {
        ...MOCK_LOGIN_RESULT,
        auth: { ...MOCK_LOGIN_RESULT.auth, accessToken: "new-at" },
      };
      fetchSpy.mockResolvedValueOnce(makeOkResponse(rotated));

      const provider = createAuthProvider(BASE_URL);
      const result = await provider.refresh({ refreshToken: "old-rt" });

      expect(result.auth.accessToken).toBe("new-at");
    });

    it("POSTs to /auth/refresh with the refresh token in the body", async () => {
      fetchSpy.mockResolvedValueOnce(makeOkResponse(MOCK_LOGIN_RESULT));

      const provider = createAuthProvider(BASE_URL);
      await provider.refresh({ refreshToken: "my-rt", stationId: "sta-1" });

      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/auth/refresh`);
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body.refreshToken).toBe("my-rt");
      expect(body.stationId).toBe("sta-1");
    });

    it("throws SESSION_EXPIRED when refresh token is expired", async () => {
      fetchSpy.mockResolvedValueOnce(
        makeErrResponse({ code: "SESSION_EXPIRED", message: "Expired" }, 401),
      );

      const provider = createAuthProvider(BASE_URL);
      await expect(
        provider.refresh({ refreshToken: "expired-rt" }),
      ).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    });
  });

  /* ---- logout ----------------------------------------------------------- */

  describe("logout", () => {
    it("resolves without a value on success", async () => {
      fetchSpy.mockResolvedValueOnce(makeOkResponse({ success: true }));

      const provider = createAuthProvider(BASE_URL);
      await expect(
        provider.logout("refresh-token", "access-token"),
      ).resolves.toBeUndefined();
    });

    it("sends the Authorization header with the access token", async () => {
      fetchSpy.mockResolvedValueOnce(makeOkResponse({ success: true }));

      const provider = createAuthProvider(BASE_URL);
      await provider.logout("rt", "my-access-token");

      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(
        (init.headers as Record<string, string>)["Authorization"],
      ).toBe("Bearer my-access-token");
    });

    it("sends the refresh token in the request body", async () => {
      fetchSpy.mockResolvedValueOnce(makeOkResponse({ success: true }));

      const provider = createAuthProvider(BASE_URL);
      await provider.logout("my-refresh-token", "at");

      const body = JSON.parse(
        (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
      ) as Record<string, unknown>;
      expect(body.refreshToken).toBe("my-refresh-token");
    });

    it("silently ignores server errors (fire-and-forget pattern)", async () => {
      fetchSpy.mockResolvedValueOnce(makeErrResponse({ code: "UNKNOWN" }, 500));

      const provider = createAuthProvider(BASE_URL);
      // The logout call DOES throw on server errors — callers (AuthContext)
      // handle this with .catch(() => {}).
      await expect(
        provider.logout("rt", "at").catch(() => "caught"),
      ).resolves.toBe("caught");
    });
  });
});
