/**
 * SocketContext — singleton Socket.IO connection scoped to the authenticated session.
 *
 * Architecture:
 *  - Mounted inside <AuthProvider> and <StationProvider>.
 *  - The socket is created only when the user is authenticated AND the station
 *    binding is resolved (both are required to subscribe to the correct rooms).
 *  - Disconnects automatically on logout (isAuthenticated → false).
 *  - Reconnects when the access token is refreshed (stable getAccessToken callback).
 *
 * Usage:
 *   const { socket, connectionState, lastConnectedAt } = useSocketContext();
 */

import React, { createContext, useContext } from "react";
import { useAuth } from "../hooks/useAuth";
import { useStation } from "../hooks/useStation";
import { useSocket, type ConnectionState } from "../hooks/useSocket";
import type { Socket } from "socket.io-client";

/* -------------------------------------------------------------------------- */
/*  Context value                                                             */
/* -------------------------------------------------------------------------- */

export interface SocketContextValue {
  /** The live Socket.IO client, or null if disconnected / not yet created. */
  socket: Socket | null;
  connectionState: ConnectionState;
  /** Timestamp of the most recent successful connection. */
  lastConnectedAt: Date | null;
}

/* -------------------------------------------------------------------------- */
/*  Context & hook                                                            */
/* -------------------------------------------------------------------------- */

const SocketContext = createContext<SocketContextValue | null>(null);

export function useSocketContext(): SocketContextValue {
  const ctx = useContext(SocketContext);
  if (!ctx)
    throw new Error("useSocketContext must be used within <SocketProvider>");
  return ctx;
}

/* -------------------------------------------------------------------------- */
/*  Provider                                                                  */
/* -------------------------------------------------------------------------- */

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, getAccessToken } = useAuth();
  const { binding } = useStation();

  const apiBaseUrl =
    window.tellerRuntime?.config.apiBaseUrl ?? "http://localhost:3000";

  const { socket, connectionState, lastConnectedAt } = useSocket({
    apiBaseUrl,
    getAccessToken,
    serviceId: binding?.serviceId ?? null,
    stationId: binding?.stationId ?? null,
    // Only connect when auth is established and service/station bindings exist.
    enabled: isAuthenticated && !!binding,
  });

  return (
    <SocketContext.Provider value={{ socket, connectionState, lastConnectedAt }}>
      {children}
    </SocketContext.Provider>
  );
}
