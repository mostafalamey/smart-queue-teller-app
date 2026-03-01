/**
 * useSocket — Socket.IO connection lifecycle hook.
 *
 * Manages a single Socket.IO connection for the SocketContext.
 *
 * Behaviour:
 *  - Connects to {apiBaseUrl}/realtime/socket.io with Bearer auth token.
 *  - Subscribes to service:{serviceId} and station:{stationId} rooms on connect
 *    and re-subscribes automatically on reconnect.
 *  - Exponential back-off reconnection is handled by socket.io-client internally.
 *  - Disconnects and cleans up when `enabled` becomes false (logout).
 *  - Updates the socket auth token in-place when the access token rotates.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export type ConnectionState = "connected" | "connecting" | "disconnected";

export interface UseSocketOptions {
  /** Base URL of the backend, e.g. "http://localhost:3000" — no trailing slash. */
  apiBaseUrl: string;
  /** Returns the current in-memory access token (or null). */
  getAccessToken: () => string | null;
  /** Service room to subscribe to after connecting. */
  serviceId: string | null;
  /** Station room to subscribe to after connecting. */
  stationId: string | null;
  /** When false the socket is disconnected and not created. */
  enabled: boolean;
}

export interface UseSocketReturn {
  socket: Socket | null;
  connectionState: ConnectionState;
  lastConnectedAt: Date | null;
}

/* -------------------------------------------------------------------------- */
/*  Hook                                                                      */
/* -------------------------------------------------------------------------- */

export function useSocket({
  apiBaseUrl,
  getAccessToken,
  serviceId,
  stationId,
  enabled,
}: UseSocketOptions): UseSocketReturn {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("disconnected");
  const [lastConnectedAt, setLastConnectedAt] = useState<Date | null>(null);

  const socketRef = useRef<Socket | null>(null);

  // Keep room IDs in refs so the subscribeToRooms callback stays stable.
  const serviceIdRef = useRef<string | null>(serviceId);
  const stationIdRef = useRef<string | null>(stationId);

  useEffect(() => {
    serviceIdRef.current = serviceId;
  }, [serviceId]);

  useEffect(() => {
    stationIdRef.current = stationId;
  }, [stationId]);

  /** Emits room-subscription events for the current service and station. */
  const subscribeToRooms = useCallback((socket: Socket) => {
    if (serviceIdRef.current) {
      socket.emit("subscribe.service", serviceIdRef.current);
    }
    if (stationIdRef.current) {
      socket.emit("subscribe.station", stationIdRef.current);
    }
  }, []);

  /* ---- Socket lifecycle -------------------------------------------------- */

  useEffect(() => {
    if (!enabled) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setConnectionState("disconnected");
      }
      return;
    }

    setConnectionState("connecting");

    const token = getAccessToken();
    const socket = io(apiBaseUrl, {
      path: "/realtime/socket.io",
      transports: ["websocket", "polling"],
      auth: { token },
      // socket.io-client handles exponential back-off reconnection internally.
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 30_000,
      reconnectionAttempts: Infinity,
      timeout: 10_000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnectionState("connected");
      setLastConnectedAt(new Date());
      subscribeToRooms(socket);
    });

    socket.on("disconnect", () => {
      setConnectionState("disconnected");
    });

    socket.on("connect_error", () => {
      setConnectionState("disconnected");
    });

    socket.io.on("reconnect_attempt", () => {
      setConnectionState("connecting");
    });

    socket.io.on("reconnect", () => {
      setConnectionState("connected");
      setLastConnectedAt(new Date());
      subscribeToRooms(socket);
    });

    socket.on(
      "authorization.error",
      (data: { code: string; message: string }) => {
        console.error("[socket] Authorization error:", data);
        socket.disconnect();
        setConnectionState("disconnected");
      },
    );

    return () => {
      socket.off();
      socket.io.off("reconnect_attempt");
      socket.io.off("reconnect");
      socket.disconnect();
      socketRef.current = null;
      setConnectionState("disconnected");
    };
    // `subscribeToRooms` is stable; `getAccessToken` is a stable ref callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, apiBaseUrl, subscribeToRooms]);

  /* ---- Keep socket auth token current after silent refresh --------------- */

  useEffect(() => {
    if (!socketRef.current) return;
    const token = getAccessToken();
    (socketRef.current.auth as Record<string, unknown>).token = token;
  });

  return {
    socket: socketRef.current,
    connectionState,
    lastConnectedAt,
  };
}
