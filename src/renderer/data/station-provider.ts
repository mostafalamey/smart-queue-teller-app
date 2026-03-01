/**
 * Station binding resolver — HTTP implementation.
 *
 * A thin, unauthenticated fetch wrapper used to resolve the local Device ID
 * to a CounterStation before the teller logs in. The endpoint is public:
 *   GET /teller/station?deviceId=<uuid>
 *
 * The deviceId acts as a "something you have" credential — returned station
 * info is operational metadata only (counter code, service name), not patient
 * data.
 */

import type { ApiError, StationBinding } from "./types";
import { DEFAULT_REQUEST_TIMEOUT_MS } from "../lib/constants";

/* -------------------------------------------------------------------------- */
/*  Mock                                                                      */
/* -------------------------------------------------------------------------- */

export const MOCK_STATION_BINDING: StationBinding = {
  stationId: "mock-station-001",
  counterCode: "C01",
  serviceId: "mock-service-001",
  serviceNameEn: "General Medicine",
  serviceNameAr: "الطب العام",
  ticketPrefix: "G",
  departmentId: "mock-dept-001",
  departmentNameEn: "Outpatient Clinic",
  departmentNameAr: "العيادة الخارجية",
};

/* -------------------------------------------------------------------------- */
/*  HTTP implementation                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Calls GET /teller/station?deviceId=<deviceId> and returns a `StationBinding`
 * on success.
 *
 * Throws an `ApiError` with code:
 *   - `"DEVICE_NOT_CONFIGURED"` — device not registered or no station assigned
 *   - `"NETWORK_ERROR"` — cannot reach server
 *   - `"TIMEOUT"` — request exceeded `timeoutMs`
 *   - `"UNKNOWN"` — unexpected response
 */
export async function resolveStationBinding(
  deviceId: string,
  baseUrl: string,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<StationBinding> {
  const base = baseUrl.replace(/\/$/, "");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `${base}/teller/station?deviceId=${encodeURIComponent(deviceId)}`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        throw {
          code: "TIMEOUT",
          message: "Device binding lookup timed out",
        } satisfies ApiError;
      }
      throw {
        code: "NETWORK_ERROR",
        message: "Cannot reach the server. Check your network connection.",
      } satisfies ApiError;
    }

    let body: Record<string, unknown> = {};
    try {
      body = (await res.json()) as Record<string, unknown>;
    } catch {
      /* JSON parse failure — body stays empty */
    }

    if (!res.ok) {
      if (body.code === "DEVICE_NOT_CONFIGURED") {
        throw {
          code: "DEVICE_NOT_CONFIGURED",
          message:
            typeof body.message === "string"
              ? body.message
              : "Device is not configured",
        } satisfies ApiError;
      }
      throw {
        code: "UNKNOWN",
        message:
          typeof body.message === "string"
            ? body.message
            : `Unexpected server error (HTTP ${res.status})`,
        status: res.status,
      } satisfies ApiError;
    }

    // Validate required fields
    if (
      typeof body.stationId !== "string" ||
      typeof body.counterCode !== "string" ||
      typeof body.serviceId !== "string"
    ) {
      throw {
        code: "UNKNOWN",
        message: "Invalid station binding response from server",
      } satisfies ApiError;
    }

    return {
      stationId: body.stationId,
      counterCode: body.counterCode,
      serviceId: body.serviceId,
      serviceNameEn: typeof body.serviceNameEn === "string" ? body.serviceNameEn : "",
      serviceNameAr: typeof body.serviceNameAr === "string" ? body.serviceNameAr : "",
      ticketPrefix: typeof body.ticketPrefix === "string" ? body.ticketPrefix : "",
      departmentId: typeof body.departmentId === "string" ? body.departmentId : "",
      departmentNameEn: typeof body.departmentNameEn === "string" ? body.departmentNameEn : "",
      departmentNameAr: typeof body.departmentNameAr === "string" ? body.departmentNameAr : "",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
