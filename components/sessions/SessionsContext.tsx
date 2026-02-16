"use client";

import { createContext, useContext, useState } from "react";

type SessionsUIState = {
  selectedSessionId: string | null;
  setSelectedSessionId: (id: string | null) => void;
};

const SessionsContext = createContext<SessionsUIState | null>(null);

export function SessionsProvider({ children }: { children: React.ReactNode }) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  return (
    <SessionsContext.Provider
      value={{ selectedSessionId, setSelectedSessionId }}
    >
      {children}
    </SessionsContext.Provider>
  );
}

export function useSessionsUI() {
  const ctx = useContext(SessionsContext);
  if (!ctx) throw new Error("useSessionsUI must be used within SessionsProvider");
  return ctx;
}
