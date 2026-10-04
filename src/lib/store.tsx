// SPDX-License-Identifier: MIT
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getDriveStatus, getWorkspace } from "./data.functions";

export type Workspace = Awaited<ReturnType<typeof getWorkspace>>;
export type Access = "none" | "read" | "exec";
export type Role = "ADMIN" | "INTERMEDIO" | "LECTOR";

type UI = { activeExpert: string; setActiveExpert: (id: string) => void };
const UICtx = createContext<UI | null>(null);
const KEY = "openexpert:active-expert";

export function UIProvider({ children }: { children: ReactNode }) {
  const [activeExpert, setState] = useState("general");
  useEffect(() => {
    const v = localStorage.getItem(KEY);
    if (v) {
      localStorage.setItem(KEY, v);
      setState(v);
    }
  }, []);
  const setActiveExpert = useCallback((id: string) => {
    localStorage.setItem(KEY, id);
    setState(id);
  }, []);
  return <UICtx.Provider value={{ activeExpert, setActiveExpert }}>{children}</UICtx.Provider>;
}
export function useUI() {
  const c = useContext(UICtx);
  if (!c) throw new Error("UIProvider missing");
  return c;
}

export const workspaceKey = ["workspace"] as const;
export function useWorkspace() {
  const fn = useServerFn(getWorkspace);
  return useQuery({ queryKey: workspaceKey, queryFn: () => fn(), refetchInterval: 15000 });
}
export function useMe(ws: Workspace | undefined) {
  return ws?.users.find((u) => u.id === ws.meId);
}

/** Whether the signed-in user has linked their own Google Drive. */
export function useDriveStatus() {
  const fn = useServerFn(getDriveStatus);
  return useQuery({ queryKey: ["drive-status"], queryFn: () => fn(), retry: false });
}

/** Wraps a server fn as a mutation that toasts errors and refreshes the workspace. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useAct<F extends (arg: any) => Promise<any>>(serverFn: F, success?: string) {
  const qc = useQueryClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fn = useServerFn(serverFn as any) as unknown as F;
  return useMutation({
    mutationFn: (arg: Parameters<F>[0]) => fn(arg),
    onSuccess: () => {
      if (success) toast.success(success);
    },
    onError: (e: Error) => toast.error(e.message || "Error"),
    onSettled: () => qc.invalidateQueries({ queryKey: workspaceKey }),
  });
}

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
