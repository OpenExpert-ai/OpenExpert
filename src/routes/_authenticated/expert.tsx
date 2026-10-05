// SPDX-License-Identifier: MIT
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RichMarkdown } from "@/components/chat/RichMarkdown";
import {
  ArrowUp,
  Mic,
  Check,
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
import { useAct, useMe, useUI, useWorkspace, workspaceKey } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { clearChat, decideAction, getChat, listConversations } from "@/lib/data.functions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ExpertForm } from "./experts";

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
  const { t } = useT();
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
        <Spinner label={t("Cargando conversación…")} />
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
  const { t, locale } = useT();
  const clear = useAct(clearChat);
  const driveConnected = ws?.integrations.find((i) => i.id === "gdrive")?.connected;
  const expert = ws?.experts.find((e) => e.id === expertId);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/chat", body: { expertId, conversationId } }),
    [expertId, conversationId],
  );

  const { messages, sendMessage, status, stop, error, setMessages, addToolApprovalResponse } =
    useChat({
      id: `expert-${expertId}-${conversationId}`,
      messages: initial,
      transport,
      // After the user approves/denies a Drive tool, continue the turn so the
      // model can answer with the tool result.
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
      onError: (e) => toast.error(e.message || t("No se pudo completar la respuesta.")),
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
  const removeConversation = (id: string) => setToDelete(id);
  const confirmRemove = () => {
    const id = toDelete;
    if (!id) return;
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
    setToDelete(null);
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
    if (!SR) {
      toast.error(t("El reconocimiento de voz no está disponible en este navegador."));
      return;
    }
    setListening(true);
    const r = new SR();
    r.lang = locale === "en" ? "en-GB" : "es-ES";
    r.interimResults = false;
    r.onresult = (e: { results: { 0: { 0: { transcript: string } } } }) =>
      setInput(e.results[0][0].transcript);
    r.onend = () => setListening(false);
    r.onerror = () => {
      setListening(false);
      toast.error(t("No se pudo usar el micrófono"));
    };
    r.start();
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="pointer-events-none absolute right-4 top-3 z-10 flex flex-col items-end gap-2">
        <div className="flex gap-2">
          {conversations.length > 0 && (
            <button
              onClick={() => setShowHist((v) => !v)}
              className="pointer-events-auto flex items-center gap-2 rounded-md border border-border bg-background/90 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur transition hover:border-primary/50 hover:text-foreground"
            >
              <History className="h-3.5 w-3.5" />
              {t("Historial ({n})", { n: conversations.length })}
            </button>
          )}
          {messages.length > 0 && (
            <button
              onClick={newConversation}
              disabled={busy}
              className="pointer-events-auto flex items-center gap-2 rounded-md border border-border bg-background/90 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur transition hover:border-primary/50 hover:text-foreground disabled:opacity-40"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              {t("Nueva conversación")}
            </button>
          )}
        </div>
        {showHist && (
          <div className="pointer-events-auto w-80 rounded-md border border-border bg-popover p-1 shadow-lg">
            <div className="px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {t("Se guardan 30 días desde el último mensaje")}
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
                    <div className="truncate">{c.title || t("Conversación")}</div>
                    <div className="font-mono text-[0.7rem] opacity-70">
                      {formatDateTime(c.updatedAt, locale)} · {t("{n} mensajes", { n: c.count })}
                    </div>
                  </button>
                  <button
                    onClick={() => removeConversation(c.id)}
                    aria-label={t("Eliminar conversación")}
                    className="opacity-60 hover:text-destructive hover:opacity-100 focus-visible:opacity-100"
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
            <div className="py-14 text-center">
              <div className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-primary">
                {t("Experto")} · {expert?.name}
              </div>
              <h1 className="mt-4 font-display text-4xl tracking-tight sm:text-5xl">
                {t("Habla con tu empresa.")}
              </h1>
              <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
                {expert?.description}
              </p>
              <div className="mx-auto mt-8 max-w-lg rounded-lg border border-border bg-card p-5 text-left">
                <div className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
                  {t("Primeros pasos")}
                </div>
                <ol className="mt-3 space-y-2 text-sm">
                  <SetupStep
                    done
                    title={t("Elige tu modelo")}
                    desc={t("Ollama, Gemini o tu propio endpoint.")}
                    action={
                      <Link
                        to="/settings/ai"
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        {t("Configurar")}
                      </Link>
                    }
                  />
                  <SetupStep
                    done={!!driveConnected}
                    title={t("Conecta Google Drive")}
                    desc={t("Opcional: leer, crear y editar tus documentos.")}
                    action={
                      <Link
                        to="/integrations/sources"
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        {driveConnected ? t("Gestionar") : t("Conectar")}
                      </Link>
                    }
                  />
                  <SetupStep
                    done
                    title={t("Pregunta lo que necesites")}
                    desc={t("Las acciones sensibles te pedirán aprobación antes de ejecutarse.")}
                  />
                </ol>
              </div>
              <div className="mt-8 grid gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(t(s))}
                    className="rounded-lg border border-border bg-card px-4 py-3 text-left text-sm text-muted-foreground transition hover:border-primary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {t(s)}
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
                  onApproval={(id, approved) => addToolApprovalResponse({ id, approved })}
                />
              ),
            )}
            {status === "submitted" && (
              <div className="flex items-center gap-3">
                <Avatar />
                <span className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                  <Spinner className="size-3 text-primary" />
                  {t("Analizando contexto…")}
                </span>
              </div>
            )}
            {error && !busy && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{error.message || t("La respuesta falló. Puedes volver a intentarlo.")}</span>
              </div>
            )}
          </div>
          <div ref={endRef} />
        </div>
      </div>
      <div className="border-t border-border bg-background px-4 py-4">
        <div className="mx-auto max-w-3xl">
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
              aria-label={t("Entrada por voz")}
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
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder={
                listening
                  ? t("Escuchando…")
                  : t("Pregunta u ordena algo a {name}…", { name: expert?.name ?? "OpenExpert" })
              }
              className="max-h-40 flex-1 resize-none bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
            />
            {busy ? (
              <button
                type="button"
                onClick={() => stop()}
                aria-label={t("Detener")}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-foreground"
              >
                <Square className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                aria-label={t("Enviar")}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-30"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            )}
          </form>
          <div className="mt-2 text-center text-[0.7rem] text-muted-foreground">
            {t("{name} · local · las acciones sensibles requieren confirmación humana", {
              name: me?.name ?? "",
            })}
          </div>
        </div>
      </div>
      <AlertDialog open={toDelete !== null} onOpenChange={(next) => !next && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("¿Eliminar esta conversación?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("Se borrarán sus mensajes de forma permanente. Esta acción no se puede deshacer.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemove}
              className={buttonVariants({ variant: "destructive" })}
            >
              {t("Eliminar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SetupStep({
  done,
  title,
  desc,
  action,
}: {
  done: boolean;
  title: string;
  desc: string;
  action?: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border ${
          done
            ? "border-success/50 bg-success/10 text-success"
            : "border-border text-muted-foreground"
        }`}
        aria-hidden
      >
        {done ? (
          <Check className="size-3" />
        ) : (
          <span className="size-1.5 rounded-full bg-current" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium text-foreground">{title}</span>
          {action}
        </span>
        <span className="block text-xs text-muted-foreground">{desc}</span>
      </span>
    </li>
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
  approval?: { id: string; approved?: boolean };
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
  onApproval,
}: {
  m: UIMessage;
  expertId: string;
  streaming?: boolean;
  onApproval: (approvalId: string, approved: boolean) => void;
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
  const { t } = useT();
  return (
    <div className="group flex gap-3">
      <Avatar />
      <div className="min-w-0 flex-1 space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[0.7rem] uppercase tracking-wider text-muted-foreground">
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
              <span className="size-1.5 animate-pulse rounded-full bg-primary" />
              {t("en vivo")}
            </span>
          )}
        </div>
        {denied && (
          <div className="flex gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-4">
            <ShieldAlert className="h-5 w-5 shrink-0 text-destructive" />
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-destructive">
                {t("Solicitud denegada · política de seguridad")}
              </div>
              <p className="mt-1 text-foreground/80">{denied.data.reason}</p>
            </div>
          </div>
        )}
        {reasoning && (
          <Collapsible label={t("Razonamiento")}>
            <p className="whitespace-pre-wrap text-xs text-muted-foreground">{reasoning}</p>
          </Collapsible>
        )}
        {tools.length > 0 && <ExecutionTimeline tools={tools} />}
        {tools.map((part) => {
          // The SDK pauses the turn here and waits for the user's decision.
          if (part.state === "approval-requested" && part.approval?.id) {
            return (
              <DriveApprovalCard
                key={part.toolCallId + "ap"}
                tool={part.type.slice(5)}
                input={(part.input ?? {}) as Record<string, unknown>}
                approvalId={part.approval.id}
                onApproval={onApproval}
              />
            );
          }
          if (part.state === "approval-responded" || part.state === "output-denied") {
            return (
              <div
                key={part.toolCallId + "dn"}
                className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground"
              >
                <X className="size-3.5" /> {t("Acceso a Google Drive denegado")}
              </div>
            );
          }
          if (part.state === "output-available") {
            return (
              <ToolCard
                key={part.toolCallId + "c"}
                name={part.type.slice(5)}
                output={part.output}
                expertId={expertId}
              />
            );
          }
          return null;
        })}
        {(text || streaming) && <RichMarkdown text={text} streaming={!!streaming} />}
        {text && !streaming && (
          <div className="flex items-center gap-3 opacity-60 transition hover:opacity-100 focus-within:opacity-100">
            <button
              onClick={() => {
                navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
              {copied ? t("Copiado") : t("Copiar")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ExecutionTimeline({ tools }: { tools: ToolPart[] }) {
  const { t } = useT();
  return (
    <div className="rounded-md border border-border bg-card/60 px-3 py-2">
      <div className="mb-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>{t("Ejecución")}</span>
        <span>
          {tools.filter((x) => x.state.startsWith("output")).length}/{tools.length} {t("pasos")}
        </span>
      </div>
      <ol>
        {tools.map((tool, i) => {
          const name = tool.type.slice(5);
          const done = tool.state === "output-available";
          const err =
            tool.state === "output-error" ||
            !!(tool.output as { error?: string } | undefined)?.error;
          const last = i === tools.length - 1;
          return (
            <li key={tool.toolCallId} className="relative pl-7">
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
                  {t(TOOL_LABEL[name] ?? name)}
                </span>
                <span
                  className={`ml-auto font-mono text-[10px] ${err ? "text-destructive" : done ? "text-success" : "text-primary"}`}
                >
                  {err ? t("blocked") : done ? t("done") : t("working…")}
                </span>
              </div>
              <Collapsible label={t("Detalles técnicos")}>
                <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded border border-border bg-sidebar p-2 font-mono text-[11px] text-muted-foreground">{`tool=${name}\ninput=${JSON.stringify(tool.input)}\n${tool.errorText ? `error=${tool.errorText}` : `output=${JSON.stringify(tool.output, null, 1)?.slice(0, 2000) ?? "…"}`}`}</pre>
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
  const { t, locale } = useT();
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
        title={t("Pipeline comercial")}
        items={[
          { label: t("Valor abierto"), value: formatCurrency(p.openValue, locale) },
          { label: t("Deals activos"), value: String(p.openDeals) },
          { label: t("Win rate"), value: `${(p.winRate * 100).toFixed(1)}%` },
          {
            label: t("Previsión ponderada"),
            value: formatCurrency(p.forecast, locale),
            tone: "good",
          },
        ]}
      />
    );
  }
  if (name === "list_overdue_invoices") {
    const inv = (o["invoices"] as { amount: number }[]) ?? [];
    return (
      <Metrics
        title={t("Facturas vencidas")}
        items={[
          { label: t("Facturas"), value: String(inv.length) },
          {
            label: t("Importe total"),
            value: formatCurrency(
              inv.reduce((a, i) => a + i.amount, 0),
              locale,
            ),
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
        title={t("Campañas activas · 7 días")}
        items={[
          { label: t("Activas"), value: String(c.length) },
          {
            label: t("Gasto"),
            value: formatCurrency(
              c.reduce((a, x) => a + x.spend7d, 0),
              locale,
            ),
          },
          {
            label: t("Sobre CPA objetivo"),
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
        title={t("Riesgo de churn")}
        items={[
          { label: t("Cuentas en riesgo"), value: String(a.length), tone: "bad" },
          {
            label: t("MRR expuesto"),
            value: formatCurrency(
              a.reduce((s, x) => s + x.mrr, 0),
              locale,
            ),
          },
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
        <FileText className="size-5 shrink-0 text-success" />
        <div className="min-w-0 flex-1">
          <div className="text-[0.7rem] uppercase tracking-wider text-success">
            {name === "create_drive_file"
              ? t("Archivo creado en Drive")
              : t("Archivo actualizado en Drive")}
          </div>
          <div className="truncate font-medium">{String(o["name"] ?? "")}</div>
        </div>
        {typeof o["webViewLink"] === "string" && (
          <a
            href={o["webViewLink"]}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {t("Abrir")} <ExternalLink className="size-3" />
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
  const { t } = useT();
  const ev = ws?.activity.find((a) => a.id === p.eventId);
  const st = ev?.status ?? "pending";
  return (
    <div className="rounded-md border border-warning/40 bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-[0.7rem] uppercase tracking-wider text-warning">
        <ShieldCheck className="size-3.5" />
        {t("Confirmación humana obligatoria")} · {p.risk}
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
            <Button
              disabled={decide.isPending}
              onClick={() =>
                decide.mutate(
                  { data: { eventId: p.eventId, approve: true } },
                  {
                    onSuccess: (r) =>
                      toast.success(
                        r.status === "pending"
                          ? t("Firma registrada: falta una segunda aprobación")
                          : t("Acción ejecutada y registrada"),
                      ),
                  },
                )
              }
            >
              {t("Aprobar y ejecutar")}
            </Button>
            <Button
              variant="outline"
              disabled={decide.isPending}
              onClick={() =>
                decide.mutate(
                  { data: { eventId: p.eventId, approve: false } },
                  { onSuccess: () => toast.message(t("Acción rechazada")) },
                )
              }
            >
              {t("Rechazar")}
            </Button>
            {ev?.summary.includes("1/2") && (
              <span className="font-mono text-[0.7rem] text-warning">{t("1/2 firmas")}</span>
            )}
          </div>
        ) : (
          <div
            className={`mt-4 flex items-center gap-2 font-mono text-xs ${st === "ok" ? "text-success" : "text-muted-foreground"}`}
          >
            {st === "ok" ? (
              <>
                <Check className="size-3.5" /> {t("Ejecutado")} · {p.eventId}
              </>
            ) : st === "reverted" ? (
              <>↺ {t("Revertido desde snapshot")}</>
            ) : (
              <>
                <X className="size-3.5" /> {t("Rechazado")}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DriveApprovalCard({
  tool,
  input,
  approvalId,
  onApproval,
}: {
  tool: string;
  input: Record<string, unknown>;
  approvalId: string;
  onApproval: (approvalId: string, approved: boolean) => void;
}) {
  const { t } = useT();
  const [decision, setDecision] = useState<null | boolean>(null);
  const summary =
    tool === "search_drive"
      ? input["query"]
        ? t("Buscar «{q}» en los archivos de Drive que elegiste", { q: String(input["query"]) })
        : t("Listar tus archivos de Drive elegidos")
      : tool === "read_drive_file"
        ? t("Leer un archivo de Drive")
        : tool === "create_drive_file"
          ? t("Crear «{name}» en Google Drive", { name: String(input["name"] ?? "") })
          : tool === "update_drive_file"
            ? t("Editar un archivo de Drive")
            : tool;
  const decide = (approved: boolean) => {
    setDecision(approved);
    onApproval(approvalId, approved);
  };
  return (
    <div className="rounded-md border border-info/40 bg-info/5 p-3">
      <div className="flex items-center gap-2 text-[0.7rem] uppercase tracking-wider text-info">
        <ShieldCheck className="size-3.5" /> {t("Acceso a Google Drive")} · {tool}
      </div>
      <div className="mt-1.5 text-sm">{summary}</div>
      {decision === null ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => decide(true)}>
            {t("Aprobar este acceso")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => decide(false)}>
            {t("Denegar")}
          </Button>
        </div>
      ) : decision ? (
        <div className="mt-2 flex items-center gap-2 text-xs text-success">
          <Check className="size-3.5" /> {t("Aprobado. Consultando Google Drive…")}
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <X className="size-3.5" /> {t("Denegado. El asistente seguirá sin ese dato.")}
        </div>
      )}
    </div>
  );
}

function FormCard({ name, desc }: { name: string; desc: string }) {
  const [done, setDone] = useState(false);
  const { setActiveExpert } = useUI();
  const { t } = useT();
  return (
    <div className="rounded-md border border-primary/40 bg-card p-4">
      <div className="mb-3 text-[0.7rem] uppercase tracking-wider text-primary">
        {t("Nuevo Experto")}
      </div>
      {done ? (
        <div className="flex items-center gap-2 text-success">
          <Check className="size-4" /> {t("Experto creado y disponible en el selector superior.")}
        </div>
      ) : (
        <ExpertForm
          initialName={name}
          initialDesc={desc}
          onDone={(id) => {
            setDone(true);
            toast.message(t("Puedes activarlo cuando quieras"), {
              action: { label: t("Activar"), onClick: () => setActiveExpert(id) },
            });
          }}
        />
      )}
    </div>
  );
}
