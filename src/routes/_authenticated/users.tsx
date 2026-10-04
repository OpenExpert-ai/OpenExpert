// SPDX-License-Identifier: MIT
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { UserPlus, Mail } from "lucide-react";
import { PageHeader, Modal, inputCls, btnPrimary, btnGhost } from "@/components/AppShell";
import { useAct, useMe, useWorkspace, fmtTime, type Access, type Role } from "@/lib/store";
import { inviteUser, setAccess, setRole } from "@/lib/data.functions";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({
    meta: [
      { title: "Miembros y Roles — OpenExpert" },
      { name: "description", content: "Control de acceso RBAC por usuario y Experto." },
      { property: "og:title", content: "Miembros y Roles — OpenExpert" },
      { property: "og:description", content: "Gestiona roles ADMIN, INTERMEDIO y LECTOR." },
    ],
  }),
  component: UsersPage,
});

const ROLES: { id: Role; desc: string }[] = [
  { id: "ADMIN", desc: "Control total, configuración global y reversión de acciones." },
  { id: "INTERMEDIO", desc: "Gestor: ejecuta procesos y consultas en su área autorizada." },
  { id: "LECTOR", desc: "Visualización sin permisos de ejecución ni modificación." },
];
const cycle: Access[] = ["none", "read", "exec"];
const cls: Record<Access, string> = {
  exec: "bg-success/15 text-success",
  read: "bg-info/15 text-info",
  none: "bg-muted text-muted-foreground/60",
};

function UsersPage() {
  const { data: ws } = useWorkspace();
  const me = useMe(ws);
  const role = useAct(setRole, "Rol actualizado");
  const access = useAct(setAccess);
  const invite = useAct(inviteUser, "Invitación registrada");
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    name: "",
    email: "",
    title: "",
    role: "LECTOR" as Role,
    expertId: "general",
  });
  if (!ws || !me) return null;
  const isAdmin = me.role === "ADMIN";

  const toggle = (uid: string, r: Role, expertId: string, cur: Access) => {
    let next: Access = cycle[(cycle.indexOf(cur) + 1) % 3] ?? "none";
    if (r === "LECTOR" && next === "exec") next = "none";
    access.mutate({ data: { userId: uid, expertId, access: next } });
  };

  return (
    <div>
      <PageHeader
        eyebrow="RBAC"
        title="Miembros y Roles"
        desc={
          isAdmin
            ? "Haz clic en una celda para alternar none → read → exec. Los cambios quedan auditados y son reversibles."
            : "Solo los ADMIN pueden modificar roles y permisos."
        }
      >
        <button
          disabled={!isAdmin}
          onClick={() => setOpen(true)}
          className={`${btnPrimary} flex items-center gap-2`}
        >
          <UserPlus className="h-4 w-4" /> Invitar
        </button>
      </PageHeader>
      <div className="grid gap-3 p-6 md:grid-cols-3">
        {ROLES.map((r) => (
          <div key={r.id} className="rounded-lg border border-border bg-card p-4">
            <div className="font-mono text-xs text-primary">{r.id}</div>
            <p className="mt-1 text-sm text-muted-foreground">{r.desc}</p>
            <div className="mt-2 font-mono text-[10px] text-muted-foreground">
              {ws.users.filter((u) => u.role === r.id).length} miembros
            </div>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto px-6 pb-8">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="py-2 pr-4">Miembro</th>
              <th className="py-2 pr-4">Rol</th>
              {ws.experts.map((e) => (
                <th key={e.id} className="px-2 py-2 text-center">
                  {e.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ws.users.map((u) => (
              <tr key={u.id} className="border-b border-border">
                <td className="py-3 pr-4">
                  <div>
                    {u.name}
                    {u.id === me.id && (
                      <span className="ml-2 font-mono text-[10px] text-primary">TÚ</span>
                    )}
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    {u.email} · {u.title}
                  </div>
                </td>
                <td className="py-3 pr-4">
                  <select
                    disabled={!isAdmin || role.isPending}
                    value={u.role}
                    onChange={(e) =>
                      role.mutate({ data: { userId: u.id, role: e.target.value as Role } })
                    }
                    className="rounded border border-input bg-background px-2 py-1 font-mono text-xs disabled:opacity-60"
                  >
                    {ROLES.map((r) => (
                      <option key={r.id}>{r.id}</option>
                    ))}
                  </select>
                </td>
                {ws.experts.map((e) => {
                  const a = (u.access[e.id] ?? "none") as Access;
                  return (
                    <td key={e.id} className="px-2 py-3 text-center">
                      <button
                        disabled={!isAdmin || u.role === "ADMIN" || access.isPending}
                        onClick={() => toggle(u.id, u.role, e.id, a)}
                        className={`w-16 rounded px-2 py-1 font-mono text-[10px] uppercase ${cls[a]} disabled:cursor-not-allowed`}
                      >
                        {a}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ws.invitations.length > 0 && (
        <div className="px-6 pb-10">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Invitaciones pendientes
          </div>
          {ws.invitations.map((i) => (
            <div
              key={i.email}
              className="flex items-center gap-3 border-b border-border py-2 text-sm"
            >
              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
              {i.name} <span className="font-mono text-xs text-muted-foreground">{i.email}</span>
              <span className="ml-auto font-mono text-[10px]">
                {i.role} · expert::{i.expert_id} · {fmtTime(i.created_at)}
              </span>
            </div>
          ))}
          <p className="mt-2 text-xs text-muted-foreground">
            La persona invitada recibe su rol automáticamente al registrarse con ese email.
          </p>
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Invitar miembro">
        <div className="space-y-3">
          <input
            className={inputCls}
            placeholder="Nombre completo"
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
          />
          <input
            className={inputCls}
            placeholder="email@empresa.com"
            value={f.email}
            onChange={(e) => setF({ ...f, email: e.target.value })}
          />
          <input
            className={inputCls}
            placeholder="Cargo"
            value={f.title}
            onChange={(e) => setF({ ...f, title: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <select
              className={inputCls}
              value={f.role}
              onChange={(e) => setF({ ...f, role: e.target.value as Role })}
            >
              {ROLES.map((r) => (
                <option key={r.id}>{r.id}</option>
              ))}
            </select>
            <select
              className={inputCls}
              value={f.expertId}
              onChange={(e) => setF({ ...f, expertId: e.target.value })}
            >
              {ws.experts.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button className={btnGhost} onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button
              className={btnPrimary}
              disabled={!f.name || !f.email.includes("@") || invite.isPending}
              onClick={() =>
                invite.mutate(
                  {
                    data: {
                      email: f.email,
                      name: f.name,
                      title: f.title,
                      role: f.role,
                      expertId: f.expertId,
                    },
                  },
                  {
                    onSuccess: () => {
                      setOpen(false);
                      setF({ name: "", email: "", title: "", role: "LECTOR", expertId: "general" });
                    },
                  },
                )
              }
            >
              Enviar invitación
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
