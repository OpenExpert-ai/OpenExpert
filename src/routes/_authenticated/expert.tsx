// SPDX-License-Identifier: MIT
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RichMarkdown } from "@/components/chat/RichMarkdown";
import {
  ArrowUp,
  Mic,
  Check,
  Loader2,
  ChevronDown,
  ShieldAlert,
  ShieldCheck,
  X,
  Square,
  Trash2,
  AlertTriangle,
  Copy,
  MessageSquarePlus,
  History,
  FileText,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAct, useMe, useUI, useWorkspace, workspaceKey } from "@/lib/store";
import { clearChat, decideAction, getChat, listConversations } from "@/lib/data.functions";
import { isLocalClient } from "@/lib/opencore/mode-env";
import { btnPrimary } from "@/components/AppShell";
import { ExpertForm } from "./experts";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/expert")({
  head: () => ({
    meta: [
      { title: "Expert — OpenExpert" },
      {
        name: "description",
        content:
          "Chat con agentes de IA que consultan tus datos y ejecutan procesos con confirmación humana.",
      },
      { property: "og:title", content: "Expert — OpenExpert" },
      {
        property: "og:description",
        content: "Habla con tu empresa: consultas y acciones con ejecución por pasos.",
      },
    ],
  }),
  component: ExpertPage,
});

const SUGGESTIONS = [
  "¿Cómo va el pipeline comercial?",
  "Reclamar facturas vencidas > 5.000€",
  "Pausar campañas con CPA alto",
  "Crear nuevo Experto para Operaciones",
];

function ExpertPage() {
  const { activeExpert } = useUI();
  const fetchChat = useServerFn(getChat);
  const fetchConvs = useServerFn(listConversations);
  const convs = useQuery({
    queryKey: ["convs", activeExpert],
    queryFn: () => fetchConvs({ data: { expertId: activeExpert } }),
  });
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [fresh] = useState(() => Date.now().toString(36));
  const conversationId =
    picked[activeExpert] ??
    (convs.data ? (convs.data[0]?.id ?? `c-${activeExpert}-${fresh}`) : undefined);
  const setConv = (id: string) => setPicked((p) => ({ ...p, [activeExpert]: id }));
  const history = useQuery({
    queryKey: ["chat", activeExpert, conversationId],
    enabled: !!conversationId && !!convs.data,
    queryFn: async () =>
      !convs.data?.some((c) => c.id === conversationId)
        ? []
        : (JSON.parse(
            await fetchChat({ data: { expertId: activeExpert, conversationId: conversationId! } }),
          ) as UIMessage[]),
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
  if (!conversationId || history.isLoading)
    return (
      <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  return (
    <ChatWindow
      key={`${activeExpert}:${conversationId}`}
      expertId={activeExpert}
      conversationId={conversationId}
      conversations={convs.data ?? []}
      onSelect={setConv}
      initial={history.data ?? []}
    />
  );
}

type Conv = { id: string; title: string; updatedAt: string; count: number };

function ChatWindow({
  expertId,
  conversationId,
  conversations,
  onSelect,
  initial,
}: {
  expertId: string;
  conversationId: string;
  conversations: Conv[];
  onSelect: (id: string) => void;
  initial: UIMessage[];
}) {
  const [showHist, setShowHist] = useState(false);
  const { data: ws } = useWorkspace();
  const me = useMe(ws);
  const qc = useQueryClient();
  const clear = useAct(clearChat);
  const expert = ws?.experts.find((e) => e.id === expertId);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { expertId, conversationId },
        headers: async (): Promise<Record<string, string>> => {
          const { data } = await supabase.auth.getSession();
          return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
        },
      }),
    [expertId, conversationId],
  );

  const { messages, sendMessage, status, stop, error, setMessages } = useChat({
    id: `expert-${expertId}-${conversationId}`,
    messages: initial,
    transport,
    onError: (e) =>
      toast.error(
        e.message?.includes("402")
          ? "Sin créditos de IA disponibles."
          : e.message?.includes("429")
            ? "Demasiadas peticiones, espera unos segundos."
            : "No se pudo completar la respuesta.",
      ),
    onFinish: () => {
      qc.invalidateQueries({ queryKey: workspaceKey });
      qc.invalidateQueries({ queryKey: ["convs", expertId] });
      taRef.current?.focus();
    },
  });
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);
  useEffect(() => {
    taRef.current?.focus();
  }, []);

  const newConversation = () => {
    if (busy) return;
    onSelect(`c-${expertId}-${Date.now().toString(36)}`);
  };
  const removeConversation = (id: string) => {
    if (!confirm("¿Eliminar esta conversación definitivamente?")) return;
    clear.mutate(
      { data: { expertId, conversationId: id } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ["convs", expertId] });
          if (id === conversationId) {
            setMessages([]);
            newConversation();
          }
        },
      },
    );
  };

  const send = (text: string) => {
    if (!text.trim() || busy) return;
    sendMessage({ text });
    setInput("");
    taRef.current?.focus();
  };

  const voice = () => {
    if (listening) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setListening(true);
    if (SR) {
      const r = new SR();
      r.lang = "es-ES";
      r.interimResults = false;
      r.onresult = (e: { results: { 0: { 0: { transcript: string } } } }) =>
        setInput(e.results[0][0].transcript);
      r.onend = () => setListening(false);
      r.onerror = () => {
        setListening(false);
        toast.error("No se pudo usar el micrófono");
      };
      r.start();
    } else {
      setTimeout(() => {
        setListening(false);
        setInput(SUGGESTIONS[Math.floor(Math.random() * SUGGESTIONS.length)] ?? "");
      }, 2000);
    }
  };

  return (
    <div className="relative flex h-[calc(100vh-57px)] flex-col">
      <div className="pointer-events-none absolute right-4 top-3 z-10 flex flex-col items-end gap-2">
        <div className="flex gap-2">
          {conversations.length > 0 && (
            <button
              onClick={() => setShowHist((v) => !v)}
              className="pointer-events-auto flex items-center gap-2 rounded-md border border-border bg-background/90 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur transition hover:border-primary/50 hover:text-foreground"
            >
              <History className="h-3.5 w-3.5" />
              Historial ({conversations.length})
            </button>
          )}
          {messages.length > 0 && (
            <button
              onClick={newConversation}
              disabled={busy}
              className="pointer-events-auto flex items-center gap-2 rounded-md border border-border bg-background/90 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur transition hover:border-primary/50 hover:text-foreground disabled:opacity-40"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              Nueva conversación
            </button>
          )}
        </div>
        {showHist && (
          <div className="pointer-events-auto w-80 rounded-md border border-border bg-popover p-1 shadow-lg">
            <div className="px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Se guardan 30 días desde el último mensaje
            </div>
            <div className="max-h-80 overflow-y-auto">
              {conversations.map((c) => (
                <div
                  key={c.id}
                  className={`group flex items-center gap-2 rounded px-2 py-2 text-xs ${c.id === conversationId ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60"}`}
                >
                  <button
                    onClick={() => {
                      onSelect(c.id);
                      setShowHist(false);
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="truncate">{c.title || "Conversación"}</div>
                    <div className="font-mono text-[10px] opacity-70">
                      {new Date(c.updatedAt).toLocaleString("es-ES", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}{" "}
                      · {c.count} msgs
                    </div>
                  </button>
                  <button
                    onClick={() => removeConversation(c.id)}
                    aria-label="Eliminar conversación"
                    className="opacity-60 hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-8">
          {messages.length === 0 && (
            <div className="py-16 text-center">
              <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary">
                Experto · {expert?.name}
              </div>
              <h1 className="mt-4 font-display text-5xl tracking-tight">Habla con tu empresa.</h1>
              <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
                {expert?.description}
              </p>
              {isLocalClient() && (
                <div className="mx-auto mt-8 max-w-md rounded-md border border-border bg-card p-4 text-left">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-primary">
                    Primeros pasos
                  </div>
                  <ol className="mt-2 space-y-1 text-sm text-muted-foreground">
                    <li>1. Elige tu modelo con `opencore init` (Ollama, Gemini o pasarela).</li>
                    <li>2. Conecta Google Drive, si quieres, en Integraciones → Fuentes.</li>
                    <li>3. Escribe tu primera pregunta abajo.</li>
                  </ol>
                </div>
              )}
              <div className="mt-10 grid gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-md border border-border bg-card px-4 py-3 text-left text-sm text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-8">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[80%] whitespace-pre-wrap rounded-lg border border-primary/20 bg-primary/10 px-4 py-2.5 text-sm text-foreground">
                    {m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")}
                  </div>
                </div>
              ) : (
                <AssistantMsg
                  key={m.id}
                  m={m}
                  expertId={expertId}
                  streaming={status === "streaming" && i === messages.length - 1}
                />
              ),
            )}
            {status === "submitted" && (
              <div className="flex items-center gap-3">
                <Avatar />
                <span className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  Analizando contexto…
                </span>
              </div>
            )}
            {error && !busy && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" />
                La respuesta falló. Puedes volver a intentarlo.
              </div>
            )}
          </div>
          <div ref={endRef} />
        </div>
      </div>
      <div className="border-t border-border bg-background px-4 py-4">
        <div className="mx-auto max-w-3xl">
          {messages.length > 0 && (
            <div className="mb-2 flex gap-2 overflow-x-auto">
              <button
                onClick={newConversation}
                className="flex items-center gap-1 whitespace-nowrap rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
                Nueva
              </button>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  disabled={busy}
                  className="whitespace-nowrap rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-end gap-2 rounded-lg border border-input bg-card p-2 focus-within:border-primary/60"
          >
            <button
              type="button"
              onClick={voice}
              aria-label="Entrada por voz"
              className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${listening ? "bg-destructive/20 text-destructive" : "text-muted-foreground hover:text-foreground"}`}
            >
              {listening && (
                <span className="absolute inset-0 animate-ping rounded-md bg-destructive/30" />
              )}
              <Mic className="relative h-4 w-4" />
            </button>
            <textarea
              ref={taRef}
              rows={1}
              value={listening ? "Escuchando…" : input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder={`Pregunta u ordena algo a ${expert?.name ?? "OpenExpert"}…`}
              className="max-h-40 flex-1 resize-none bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
            />
            {busy ? (
              <button
                type="button"
                onClick={() => stop()}
                aria-label="Detener"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-foreground"
              >
                <Square className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                aria-label="Enviar"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-30"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            )}
          </form>
          <div className="mt-2 text-center font-mono text-[10px] text-muted-foreground">
            {me?.name} · {me?.role} · acceso{" "}
            {me?.role === "ADMIN" ? "exec" : (me?.access[expertId] ?? "none")} · las acciones
            sensibles requieren confirmación humana
          </div>
        </div>
      </div>
    </div>
  );
}

const Avatar = () => (
  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded border border-primary/40 font-display text-sm text-primary">
    E
  </div>
);

const TOOL_LABEL: Record<string, string> = {
  get_pipeline_summary: "Consultando pipeline en Pipedrive",
  list_deals: "Listando deals del CRM",
  list_overdue_invoices: "Leyendo facturas vencidas en Holded",
  get_campaign_performance: "Extrayendo métricas de Meta Ads y GA",
  get_churn_risk: "Evaluando riesgo de churn",
  list_processes: "Cargando catálogo de procesos",
  propose_invoice_reminders: "Preparando reclamaciones de cobro",
  propose_pause_campaigns: "Preparando pausa de campañas",
  request_process_run: "Preparando ejecución de proceso",
  open_expert_form: "Cargando plantilla de Experto",
  search_drive: "Buscando en Google Drive",
  read_drive_file: "Leyendo documento de Drive",
  create_drive_file: "Creando archivo en Google Drive",
  update_drive_file: "Actualizando archivo en Google Drive",
};

type ToolPart = {
  type: string;
  toolCallId: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

const SOURCE: Record<string, string> = {
  get_pipeline_summary: "Pipedrive",
  list_deals: "Pipedrive",
  list_overdue_invoices: "Holded",
  propose_invoice_reminders: "Holded",
  get_campaign_performance: "Meta Ads",
  propose_pause_campaigns: "Meta Ads",
  get_churn_risk: "CRM",
  list_processes: "Procs",
  request_process_run: "Procs",
  search_drive: "Google Drive",
  read_drive_file: "Google Drive",
  create_drive_file: "Google Drive",
  update_drive_file: "Google Drive",
};

function AssistantMsg({
  m,
  expertId,
  streaming,
}: {
  m: UIMessage;
  expertId: string;
  streaming?: boolean;
}) {
  const tools = m.parts.filter((p) => p.type.startsWith("tool-")) as unknown as ToolPart[];
  const reasoning = m.parts
    .filter((p) => p.type === "reasoning")
    .map((p) => (p as { text: string }).text)
    .join("\n")
    .trim();
  const denied = m.parts.find((p) => p.type === "data-denied") as
    { data: { reason: string } } | undefined;
  const text = m.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("\n\n")
    .trim();
  const sources = [...new Set(tools.map((t) => SOURCE[t.type.slice(5)]).filter(Boolean))];
  const [copied, setCopied] = useState(false);
  return (
    <div className="group flex gap-3">
      <Avatar />
      <div className="min-w-0 flex-1 space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <span className="text-primary">OpenExpert</span>
          <span>· {expertId}</span>
          {sources.map((s) => (
            <span
              key={s}
              className="rounded border border-border px-1.5 py-0.5 normal-case tracking-normal text-foreground/70"
            >
              {s}
            </span>
          ))}
          {streaming && (
            <span className="flex items-center gap-1 text-primary">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              live
            </span>
          )}
        </div>
        {denied && (
          <div className="flex gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-4">
            <ShieldAlert className="h-5 w-5 shrink-0 text-destructive" />
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-destructive">
                Solicitud denegada · política de seguridad
              </div>
              <p className="mt-1 text-foreground/80">{denied.data.reason}</p>
            </div>
          </div>
        )}
        {reasoning && (
          <Collapsible label="Razonamiento">
            <p className="whitespace-pre-wrap text-xs text-muted-foreground">{reasoning}</p>
          </Collapsible>
        )}
        {tools.length > 0 && <ExecutionTimeline tools={tools} />}
        {tools
          .filter((t) => t.state === "output-available")
          .map((t) => (
            <ToolCard
              key={t.toolCallId + "c"}
              name={t.type.slice(5)}
              output={t.output}
              expertId={expertId}
            />
          ))}
        {(text || streaming) && <RichMarkdown text={text} streaming={!!streaming} />}
        {text && !streaming && (
          <div className="flex items-center gap-3 opacity-0 transition group-hover:opacity-100">
            <button
              onClick={() => {
                navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ExecutionTimeline({ tools }: { tools: ToolPart[] }) {
  return (
    <div className="rounded-md border border-border bg-card/60 px-3 py-2">
      <div className="mb-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>Ejecución</span>
        <span>
          {tools.filter((t) => t.state.startsWith("output")).length}/{tools.length} pasos
        </span>
      </div>
      <ol>
        {tools.map((t, i) => {
          const name = t.type.slice(5);
          const done = t.state === "output-available";
          const err =
            t.state === "output-error" || !!(t.output as { error?: string } | undefined)?.error;
          const last = i === tools.length - 1;
          return (
            <li key={t.toolCallId} className="relative pl-7">
              {!last && <span className="absolute left-[9px] top-6 bottom-0 w-px bg-border" />}
              <span
                className={`absolute left-0 top-1.5 flex h-[19px] w-[19px] items-center justify-center rounded-full border ${err ? "border-destructive/50 bg-destructive/10 text-destructive" : done ? "border-success/50 bg-success/10 text-success" : "border-primary/60 text-primary"}`}
              >
                {err ? (
                  <X className="h-3 w-3" />
                ) : done ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <span className="h-1.5 w-1.5 animate-ping rounded-full bg-primary" />
                )}
              </span>
              <div className="flex items-center gap-3 py-1.5">
                <span className={done || err ? "text-foreground/90" : "text-foreground"}>
                  {TOOL_LABEL[name] ?? name}
                </span>
                <span
                  className={`ml-auto font-mono text-[10px] ${err ? "text-destructive" : done ? "text-success" : "text-primary"}`}
                >
                  {err ? "blocked" : done ? "done" : "working…"}
                </span>
              </div>
              <Collapsible label="Detalles técnicos">
                <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded border border-border bg-sidebar p-2 font-mono text-[11px] text-muted-foreground">{`tool=${name}\ninput=${JSON.stringify(t.input)}\n${t.errorText ? `error=${t.errorText}` : `output=${JSON.stringify(t.output, null, 1)?.slice(0, 2000) ?? "…"}`}`}</pre>
              </Collapsible>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Collapsible({
  label,
  children,
  inset,
}: {
  label: string;
  children: React.ReactNode;
  inset?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={inset ? "px-3 pb-1" : ""}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
      >
        <ChevronDown className={`h-3 w-3 transition ${open ? "rotate-180" : ""}`} /> {label}
      </button>
      {open && <div className="pb-2">{children}</div>}
    </div>
  );
}

const eur = (n: number) => `${Math.round(n).toLocaleString("es-ES")} €`;

function Metrics({
  title,
  items,
}: {
  title: string;
  items: { label: string; value: string; tone?: "bad" | "good" }[];
}) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <div className="border-b border-border px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4">
        {items.map((x) => (
          <div
            key={x.label}
            className={`border-border px-4 py-3 not-last:border-r ${x.tone === "bad" ? "shadow-[inset_0_2px_0_var(--destructive)]" : x.tone === "good" ? "shadow-[inset_0_2px_0_var(--success)]" : ""}`}
          >
            <div
              className={`font-mono text-xl tabular-nums tracking-tight ${x.tone === "bad" ? "text-destructive" : x.tone === "good" ? "text-success" : "text-foreground"}`}
            >
              {x.value}
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">{x.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ToolCard({ name, output, expertId }: { name: string; output: unknown; expertId: string }) {
  const o = output as Record<string, unknown> & { error?: string };
  if (!o || o.error) return null;
  if (name === "get_pipeline_summary") {
    const p = o as unknown as {
      openValue: number;
      openDeals: number;
      winRate: number;
      forecast: number;
      stalled: unknown[];
    };
    return (
      <Metrics
        title="Pipeline comercial"
        items={[
          { label: "Valor abierto", value: eur(p.openValue) },
          { label: "Deals activos", value: String(p.openDeals) },
          { label: "Win rate", value: `${(p.winRate * 100).toFixed(1)}%` },
          { label: "Previsión ponderada", value: eur(p.forecast), tone: "good" },
        ]}
      />
    );
  }
  if (name === "list_overdue_invoices") {
    const inv = (o["invoices"] as { amount: number }[]) ?? [];
    return (
      <Metrics
        title="Facturas vencidas"
        items={[
          { label: "Facturas", value: String(inv.length) },
          {
            label: "Importe total",
            value: eur(inv.reduce((a, i) => a + i.amount, 0)),
            tone: "bad",
          },
        ]}
      />
    );
  }
  if (name === "get_campaign_performance") {
    const c = (
      (o["campaigns"] as { status: string; spend7d: number; overTargetPct: number | null }[]) ?? []
    ).filter((x) => x.status === "active");
    return (
      <Metrics
        title="Campañas activas · 7 días"
        items={[
          { label: "Activas", value: String(c.length) },
          { label: "Gasto", value: eur(c.reduce((a, x) => a + x.spend7d, 0)) },
          {
            label: "Sobre CPA objetivo",
            value: String(c.filter((x) => (x.overTargetPct ?? 0) > 30).length),
            tone: "bad",
          },
        ]}
      />
    );
  }
  if (name === "get_churn_risk") {
    const a = ((o["accounts"] as { risk: number; mrr: number }[]) ?? []).filter(
      (x) => x.risk >= 0.5,
    );
    return (
      <Metrics
        title="Riesgo de churn"
        items={[
          { label: "Cuentas en riesgo", value: String(a.length), tone: "bad" },
          { label: "MRR expuesto", value: eur(a.reduce((s, x) => s + x.mrr, 0)) },
        ]}
      />
    );
  }
  if (name.startsWith("propose_") || name === "request_process_run")
    return (
      <ConfirmCard
        p={o as unknown as { eventId: string; title: string; risk: string; items: string[] }}
        expertId={expertId}
      />
    );
  if ((name === "create_drive_file" || name === "update_drive_file") && !o["error"])
    return (
      <div className="flex items-center gap-3 rounded-md border border-success/40 bg-success/10 p-3">
        <FileText className="h-5 w-5 shrink-0 text-success" />
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] uppercase tracking-wider text-success">
            {name === "create_drive_file"
              ? "Archivo creado en Drive"
              : "Archivo actualizado en Drive"}
          </div>
          <div className="truncate font-medium">{String(o["name"] ?? "")}</div>
        </div>
        {typeof o["webViewLink"] === "string" && (
          <a
            href={o["webViewLink"]}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-accent"
          >
            Abrir <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    );
  if (name === "open_expert_form")
    return (
      <FormCard
        name={String(o["suggestedName"] ?? "")}
        desc={String(o["suggestedDescription"] ?? "")}
      />
    );
  return null;
}

function ConfirmCard({
  p,
}: {
  p: { eventId: string; title: string; risk: string; items: string[] };
  expertId: string;
}) {
  const { data: ws } = useWorkspace();
  const decide = useAct(decideAction);
  const ev = ws?.activity.find((a) => a.id === p.eventId);
  const st = ev?.status ?? "pending";
  return (
    <div className="rounded-md border border-warning/40 bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-warning">
        <ShieldCheck className="h-3.5 w-3.5" /> Confirmación humana obligatoria · {p.risk}
      </div>
      <div className="p-4">
        <div className="font-medium">{p.title}</div>
        <ul className="mt-2 space-y-1 font-mono text-xs text-muted-foreground">
          {p.items.map((i) => (
            <li key={i}>→ {i}</li>
          ))}
        </ul>
        {st === "pending" ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              className={btnPrimary}
              disabled={decide.isPending}
              onClick={() =>
                decide.mutate(
                  { data: { eventId: p.eventId, approve: true } },
                  {
                    onSuccess: (r) =>
                      toast.success(
                        r.status === "pending"
                          ? "Firma registrada: falta una segunda aprobación"
                          : "Acción ejecutada y registrada",
                      ),
                  },
                )
              }
            >
              Aprobar y ejecutar
            </button>
            <button
              className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
              disabled={decide.isPending}
              onClick={() => decide.mutate({ data: { eventId: p.eventId, approve: false } })}
            >
              Rechazar
            </button>
            {ev?.summary.includes("1/2") && (
              <span className="font-mono text-[10px] text-warning">1/2 firmas</span>
            )}
          </div>
        ) : (
          <div
            className={`mt-4 flex items-center gap-2 font-mono text-xs ${st === "ok" ? "text-success" : "text-muted-foreground"}`}
          >
            {st === "ok" ? (
              <>
                <Check className="h-3.5 w-3.5" /> Ejecutado · {p.eventId}
              </>
            ) : st === "reverted" ? (
              <>↺ Revertido desde snapshot</>
            ) : (
              <>
                <X className="h-3.5 w-3.5" /> Rechazado
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FormCard({ name, desc }: { name: string; desc: string }) {
  const [done, setDone] = useState(false);
  const { setActiveExpert } = useUI();
  return (
    <div className="rounded-md border border-primary/40 bg-card p-4">
      <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-primary">
        Nuevo Experto
      </div>
      {done ? (
        <div className="flex items-center gap-2 text-success">
          <Check className="h-4 w-4" /> Experto creado y disponible en el selector superior.
        </div>
      ) : (
        <ExpertForm
          initialName={name}
          initialDesc={desc}
          onDone={(id) => {
            setDone(true);
            toast.message("Puedes activarlo cuando quieras", {
              action: { label: "Activar", onClick: () => setActiveExpert(id) },
            });
          }}
        />
      )}
    </div>
  );
}
