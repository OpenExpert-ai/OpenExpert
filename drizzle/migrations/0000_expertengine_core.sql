CREATE TYPE public.app_role AS ENUM ('ADMIN','INTERMEDIO','LECTOR');

CREATE TABLE public.profiles (id uuid PRIMARY KEY, name text NOT NULL DEFAULT '', email text NOT NULL DEFAULT '', title text NOT NULL DEFAULT 'Miembro', created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, UPDATE ON public.profiles TO authenticated; GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());

CREATE TABLE public.user_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, role public.app_role NOT NULL, UNIQUE(user_id));
GRANT SELECT ON public.user_roles TO authenticated; GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read roles" ON public.user_roles FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role) $$;

CREATE TABLE public.sub_brains (id text PRIMARY KEY, name text NOT NULL, description text NOT NULL DEFAULT '', sources text[] NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.sub_brain_access (user_id uuid NOT NULL, sub_brain_id text NOT NULL REFERENCES public.sub_brains(id) ON DELETE CASCADE, access text NOT NULL DEFAULT 'none', PRIMARY KEY(user_id, sub_brain_id));
CREATE TABLE public.integrations (id text PRIMARY KEY, name text NOT NULL, category text NOT NULL, connected boolean NOT NULL DEFAULT false, entities jsonb NOT NULL DEFAULT '[]', last_sync timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.processes (id text PRIMARY KEY, name text NOT NULL, description text NOT NULL, trigger text NOT NULL, stages text[] NOT NULL, limits text[] NOT NULL, approval text NOT NULL, sub_brain text NOT NULL, active boolean NOT NULL DEFAULT true, runs int NOT NULL DEFAULT 0, last_run timestamptz);
CREATE TABLE public.activity (id text PRIMARY KEY, ts timestamptz NOT NULL DEFAULT now(), actor text NOT NULL, actor_name text NOT NULL, type text NOT NULL, sub_brain text NOT NULL, status text NOT NULL, summary text NOT NULL, sources text[] NOT NULL DEFAULT '{}', duration_ms int NOT NULL DEFAULT 0, snapshot jsonb);
CREATE TABLE public.invitations (email text PRIMARY KEY, name text NOT NULL DEFAULT '', title text NOT NULL DEFAULT 'Invitado', role public.app_role NOT NULL, sub_brain text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.chat_messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, sub_brain text NOT NULL, message jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ON public.chat_messages(user_id, sub_brain, created_at);
-- business data
CREATE TABLE public.deals (id serial PRIMARY KEY, company text NOT NULL, stage text NOT NULL, value numeric NOT NULL, owner text NOT NULL, days_in_stage int NOT NULL, close_date date NOT NULL, status text NOT NULL DEFAULT 'open');
CREATE TABLE public.invoices (id text PRIMARY KEY, client text NOT NULL, amount numeric NOT NULL, due_date date NOT NULL, status text NOT NULL, reminders int NOT NULL DEFAULT 0);
CREATE TABLE public.campaigns (id text PRIMARY KEY, name text NOT NULL, channel text NOT NULL, status text NOT NULL, spend_7d numeric NOT NULL, conversions_7d int NOT NULL, cpa_target numeric NOT NULL, daily_budget numeric NOT NULL);
CREATE TABLE public.accounts (id serial PRIMARY KEY, name text NOT NULL, mrr numeric NOT NULL, usage_trend numeric NOT NULL, open_tickets int NOT NULL, churn_risk numeric NOT NULL);

DO $$ DECLARE t text; BEGIN
FOREACH t IN ARRAY ARRAY['sub_brains','sub_brain_access','integrations','processes','activity','invitations','deals','invoices','campaigns','accounts'] LOOP
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated; GRANT ALL ON public.%I TO service_role; ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY; CREATE POLICY "members read" ON public.%I FOR SELECT TO authenticated USING (true);', t,t,t,t);
END LOOP; END $$;
GRANT SELECT, INSERT, DELETE ON public.chat_messages TO authenticated; GRANT ALL ON public.chat_messages TO service_role;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own messages read" ON public.chat_messages FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own messages insert" ON public.chat_messages FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own messages delete" ON public.chat_messages FOR DELETE TO authenticated USING (user_id = auth.uid());

-- new user bootstrap: first user ADMIN, invited users get invitation, others LECTOR
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv public.invitations; r public.app_role; first boolean;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO first;
  SELECT * INTO inv FROM public.invitations WHERE lower(email)=lower(NEW.email);
  r := CASE WHEN first THEN 'ADMIN'::public.app_role WHEN inv.email IS NOT NULL THEN inv.role ELSE 'LECTOR'::public.app_role END;
  INSERT INTO public.profiles(id,name,email,title) VALUES (NEW.id, COALESCE(NULLIF(inv.name,''), NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)), NEW.email, CASE WHEN first THEN 'Administrador' ELSE COALESCE(inv.title,'Miembro') END);
  INSERT INTO public.user_roles(user_id,role) VALUES (NEW.id, r);
  INSERT INTO public.sub_brain_access(user_id, sub_brain_id, access)
    SELECT NEW.id, sb.id, CASE WHEN r='ADMIN' THEN 'exec' WHEN inv.sub_brain = sb.id THEN (CASE WHEN r='LECTOR' THEN 'read' ELSE 'exec' END) WHEN sb.id='general' THEN 'read' ELSE 'none' END FROM public.sub_brains sb;
  IF inv.email IS NOT NULL THEN DELETE FROM public.invitations WHERE email=inv.email; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- seed
INSERT INTO public.sub_brains(id,name,description,sources) VALUES
('general','General','Visión global de la compañía: KPIs consolidados, OKRs y dirección.','{pipedrive,holded,meta,gdrive,slack}'),
('ventas','Ventas','CRM, pipeline comercial, leads y previsión de cierre.','{pipedrive,salesforce,gmail}'),
('marketing','Marketing','Campañas, inversión publicitaria, atribución y métricas de adquisición.','{meta,ga,gdrive}'),
('finanzas','Finanzas','Facturación, ERP, conciliación bancaria y tesorería.','{holded,gmail,gdrive}');
INSERT INTO public.integrations(id,name,category,connected,entities,last_sync) VALUES
('pipedrive','Pipedrive','CRM',true,'[{"name":"Deals","count":412},{"name":"Organizaciones","count":1288},{"name":"Actividades","count":9341}]',now()-interval '4 min'),
('salesforce','Salesforce','CRM',false,'[{"name":"Opportunities","count":0},{"name":"Accounts","count":0}]',now()-interval '14 days'),
('holded','Holded','ERP / Finanzas',true,'[{"name":"Facturas","count":3204},{"name":"Contactos","count":860},{"name":"Movimientos bancarios","count":15422}]',now()-interval '11 min'),
('meta','Meta Ads','Publicidad',true,'[{"name":"Campañas","count":38},{"name":"Conjuntos de anuncios","count":141},{"name":"Creatividades","count":506}]',now()-interval '7 min'),
('ga','Google Analytics','Publicidad',true,'[{"name":"Sesiones (30d)","count":184220},{"name":"Conversiones","count":3120}]',now()-interval '15 min'),
('gdrive','Google Drive','Productividad',true,'[{"name":"Documentos","count":2147},{"name":"Hojas de cálculo","count":389}]',now()-interval '32 min'),
('gmail','Gmail','Productividad',true,'[{"name":"Hilos indexados","count":48211}]',now()-interval '2 min'),
('slack','Slack','Productividad',false,'[{"name":"Canales","count":0},{"name":"Mensajes","count":0}]',now()-interval '6 days');
INSERT INTO public.processes(id,name,description,trigger,stages,limits,approval,sub_brain,active,runs,last_run) VALUES
('p-leads','Generación de Leads B2B','Identifica cuentas ICP, enriquece contactos y crea deals cualificados en el CRM.','Cron · lunes 08:00','{"Scraping de señales ICP","Enriquecimiento de contactos","Scoring con modelo propio","Alta en Pipedrive"}','{"Máx. 150 leads/semana","Sin envío automático de emails","Solo dominios corporativos"}','Ninguna','ventas',true,42,now()-interval '2 days'),
('p-invoices','Seguimiento de Facturas Vencidas','Detecta facturas vencidas en Holded y redacta reclamaciones escalonadas.','Evento · factura vence +7 días','{"Lectura de facturas en Holded","Clasificación por antigüedad","Redacción de reclamación","Envío por Gmail"}','{"Importe > 5.000€ exige aprobación","Máx. 3 recordatorios por cliente","Tono formal obligatorio"}','Requerida','finanzas',true,118,now()-interval '10 hours'),
('p-pipeline','Salud del Pipeline','Analiza deals estancados, riesgo de cierre y genera informe semanal.','Cron · viernes 17:00','{"Extracción de deals abiertos","Detección de estancamiento","Predicción de cierre","Informe a Slack"}','{"Solo lectura sobre CRM"}','Ninguna','ventas',true,36,now()-interval '5 days'),
('p-campaigns','Eficiencia de Campañas','Monitoriza CPA y ROAS; propone pausar o reasignar presupuesto.','Umbral · CPA > objetivo +30%','{"Lectura de métricas Meta/GA","Comparativa con objetivos","Propuesta de acción","Ejecución en Meta Ads"}','{"Cambios de presupuesto > 500€/día exigen aprobación","Nunca borrar campañas"}','Requerida','marketing',true,77,now()-interval '3 hours'),
('p-churn','Detección de Churn','Cruza uso de producto, tickets y facturación para anticipar bajas.','Cron · diario 06:00','{"Unificación de señales","Modelo de riesgo","Alerta al account manager","Propuesta de retención"}','{"Descuentos de retención requieren doble firma"}','Doble firma','general',false,12,now()-interval '20 days');
INSERT INTO public.deals(company,stage,value,owner,days_in_stage,close_date) VALUES
('Grupo Ventura','Negociación',84000,'Lucía Ferrer',27,current_date+12),('Kobalt Systems','Propuesta',46000,'Lucía Ferrer',9,current_date+25),('Lumen Retail','Negociación',121000,'Jordi Puig',33,current_date+8),
('Ondara Labs','Cualificación',18000,'Jordi Puig',4,current_date+60),('Brisa Energía','Demo',62000,'Lucía Ferrer',15,current_date+40),('Helix Pharma','Negociación',210000,'Jordi Puig',22,current_date+18),
('Nautia Seguros','Propuesta',73000,'Lucía Ferrer',31,current_date+30),('Cervera Foods','Demo',29000,'Jordi Puig',6,current_date+45),('Talos Mobility','Cualificación',54000,'Lucía Ferrer',2,current_date+75),
('Aurea Hoteles','Propuesta',97000,'Jordi Puig',12,current_date+20),('Vértice Legal','Negociación',38000,'Lucía Ferrer',41,current_date+5),('Mosaic Health','Demo',115000,'Jordi Puig',19,current_date+35);
INSERT INTO public.deals(company,stage,value,owner,days_in_stage,close_date,status) VALUES ('Nimbus Retail','Cerrado',88000,'Lucía Ferrer',0,current_date-10,'won'),('Prisma Bank','Cerrado',150000,'Jordi Puig',0,current_date-20,'won'),('Orbe Telecom','Cerrado',40000,'Jordi Puig',0,current_date-15,'lost');
INSERT INTO public.invoices(id,client,amount,due_date,status,reminders) VALUES
('F-2026-0812','Grupo Ventura',18400,current_date-34,'overdue',1),('F-2026-0844','Kobalt Systems',9250,current_date-21,'overdue',0),('F-2026-0871','Lumen Retail',7800,current_date-15,'overdue',0),
('F-2026-0889','Ondara Labs',5320,current_date-9,'overdue',0),('F-2026-0893','Cervera Foods',2100,current_date-12,'overdue',2),('F-2026-0901','Aurea Hoteles',3400,current_date-3,'overdue',0),
('F-2026-0915','Helix Pharma',42000,current_date+20,'pending',0),('F-2026-0920','Brisa Energía',12500,current_date+10,'pending',0),('F-2026-0790','Prisma Bank',37500,current_date-40,'paid',0);
INSERT INTO public.campaigns(id,name,channel,status,spend_7d,conversions_7d,cpa_target,daily_budget) VALUES
('c-ret-es','Retargeting_ES_Q4','Meta Ads','active',2130,30,42,320),('c-lal-fin','Lookalike_Fintech','Meta Ads','active',1890,30,42,280),('c-brand-latam','Brand_Video_LATAM','Meta Ads','active',1160,20,42,180),
('c-search-b2b','Search_B2B_Core','Google Ads','active',3400,112,42,500),('c-lead-ebook','LeadMagnet_Ebook_IA','Meta Ads','active',980,41,42,150),('c-webinar','Webinar_Nov','Meta Ads','paused',600,9,42,100);
INSERT INTO public.accounts(name,mrr,usage_trend,open_tickets,churn_risk) VALUES
('Cervera Foods',4200,-0.38,6,0.71),('Vértice Legal',2900,-0.22,3,0.54),('Nimbus Retail',7800,0.12,1,0.12),('Prisma Bank',12500,0.05,0,0.08),('Aurea Hoteles',3600,-0.31,4,0.63),('Talos Mobility',1900,-0.15,2,0.41),('Helix Pharma',9400,0.2,1,0.1),('Ondara Labs',2400,-0.45,5,0.77);
INSERT INTO public.activity(id,ts,actor,actor_name,type,sub_brain,status,summary,sources,duration_ms) VALUES
('evt_9f3a21',now()-interval '12 min','agent','Proc · Eficiencia de Campañas','Acción externa','marketing','ok','Análisis de CPA semanal completado sin incidencias.','{"Meta Ads","Google Analytics"}',8420),
('evt_0c8e55',now()-interval '1 day','agent','Proc · Generación de Leads B2B','Escritura CRM','ventas','ok','Creados 37 deals cualificados (score medio 78).','{Pipedrive,Gmail}',61200);