/**
 * NetworkHealthContext — provides the combined network health status to the
 * authenticated portion of the app.
 *
 * Must be mounted inside <SocketProvider> so it can read the WebSocket
 * connection state. Exposes networkStatus ("online" | "degraded" | "offline")
 * and the timestamp of the last HTTP health ping.
 *
 * Usage:
 *   const { networkStatus, lastCheckedAt } = useNetworkHealthContext();
 */

import React, { createContext, useContext } from "react";
import { useSocketContext } from "./SocketContext";
import {
  useNetworkHealth,
  type NetworkStatus,
} from "../hooks/useNetworkHealth";

/* -------------------------------------------------------------------------- */
/*  Context value                                                             */
/* -------------------------------------------------------------------------- */

export interface NetworkHealthContextValue {
  networkStatus: NetworkStatus;
  /** Timestamp of the last HTTP health ping (null if not yet checked). */
  lastCheckedAt: Date | null;
}

/* -------------------------------------------------------------------------- */
/*  Context & hook                                                            */
/* -------------------------------------------------------------------------- */

const NetworkHealthContext = createContext<NetworkHealthContextValue | null>(
  null,
);

export function useNetworkHealthContext(): NetworkHealthContextValue {
  const ctx = useContext(NetworkHealthContext);
  if (!ctx)
    throw new Error(
      "useNetworkHealthContext must be used within <NetworkHealthProvider>",
    );
  return ctx;
}

/* -------------------------------------------------------------------------- */
/*  Provider                                                                  */
/* -------------------------------------------------------------------------- */

export function NetworkHealthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { connectionState } = useSocketContext();

  const apiBaseUrl =
    window.tellerRuntime?.config.apiBaseUrl ?? "http://localhost:3000";

  const { networkStatus, lastCheckedAt } = useNetworkHealth({
    apiBaseUrl,
    wsConnectionState: connectionState,
    enabled: true,
  });

  return (
    <NetworkHealthContext.Provider value={{ networkStatus, lastCheckedAt }}>
      {children}
    </NetworkHealthContext.Provider>
  );
}
