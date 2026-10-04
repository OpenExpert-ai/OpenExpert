-- 0010: elimina el modelo anterior a los Expertos.
--
-- Entre las migraciones 0004 y 0010 convivieron dos nombres para el mismo
-- concepto, con triggers que los mantenian sincronizados. El codigo ya solo
-- usa experts / expert_id, asi que esta migracion retira la version vieja:
--   1. triggers y funciones de sincronia,
--   2. el indice antiguo de chat_messages,
--   3. las columnas heredadas (expert_id pasa a NOT NULL con default 'general'),
--   4. handle_new_user sin la rama de compatibilidad,
--   5. las tablas heredadas.

-- 1. Triggers y funciones del espejo ---------------------------------------
drop trigger if exists mirror_expert_new on public.experts;
drop trigger if exists mirror_access_new on public.expert_access;
drop trigger if exists mirror_expert_legacy on public.sub_brains;
drop trigger if exists mirror_access_legacy on public.sub_brain_access;
drop trigger if exists sync_process_expert on public.processes;
drop trigger if exists sync_activity_expert on public.activity;
drop trigger if exists sync_invitation_expert on public.invitations;
drop trigger if exists sync_chat_expert on public.chat_messages;

drop function if exists public.mirror_expert();
drop function if exists public.mirror_expert_access();
drop function if exists public.sync_expert_context();

-- 2. Indice antiguo sobre la columna heredada -------------------------------
drop index if exists public.chat_messages_conv_idx;

-- 3. expert_id pasa a ser la unica columna, NOT NULL con default -------------
update public.processes set expert_id = 'general' where expert_id is null;
update public.activity set expert_id = 'general' where expert_id is null;
update public.invitations set expert_id = 'general' where expert_id is null;
update public.chat_messages set expert_id = 'general' where expert_id is null;

alter table public.processes alter column expert_id set default 'general';
alter table public.activity alter column expert_id set default 'general';
alter table public.invitations alter column expert_id set default 'general';
alter table public.chat_messages alter column expert_id set default 'general';

alter table public.processes alter column expert_id set not null;
alter table public.activity alter column expert_id set not null;
alter table public.invitations alter column expert_id set not null;
alter table public.chat_messages alter column expert_id set not null;

alter table public.processes drop column if exists sub_brain;
alter table public.activity drop column if exists sub_brain;
alter table public.invitations drop column if exists sub_brain;
alter table public.chat_messages drop column if exists sub_brain;

-- 4. handle_new_user sin compatibilidad --------------------------------------
create or replace function public.handle_new_user()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare inv public.invitations; r public.app_role; first boolean; ctx text;
        owner_email text := coalesce(nullif(current_setting('app.owner_email', true), ''), 'owner@example.com');
begin
  if coalesce(NEW.raw_app_meta_data->>'provider','') <> 'google' then raise exception 'Acceso no autorizado'; end if;
  select * into inv from public.invitations where lower(email)=lower(NEW.email);
  if lower(NEW.email) <> owner_email and inv.email is null then raise exception 'Acceso no autorizado'; end if;
  select not exists (select 1 from public.user_roles) into first;
  r := case when first or lower(NEW.email)=owner_email then 'ADMIN'::public.app_role else inv.role end;
  ctx := inv.expert_id;
  insert into public.profiles(id,name,email,title) values (NEW.id, coalesce(nullif(inv.name,''), NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)), NEW.email, case when r='ADMIN' and inv.email is null then 'Administrador' else coalesce(inv.title,'Miembro') end);
  insert into public.user_roles(user_id,role) values (NEW.id, r);
  insert into public.expert_access(user_id, expert_id, access)
    select NEW.id, e.id, case when r='ADMIN' then 'exec' when ctx = e.id then (case when r='LECTOR' then 'read' else 'exec' end) when e.id='general' then 'read' else 'none' end from public.experts e
    on conflict do nothing;
  if inv.email is not null then delete from public.invitations where email=inv.email; end if;
  return NEW;
end $function$;

-- 5. Tablas heredadas ---------------------------------------------------------
drop table if exists public.sub_brain_access;
drop table if exists public.sub_brains;
