CREATE OR REPLACE FUNCTION public.reset_demo() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.sub_brains WHERE id NOT IN ('general','ventas','marketing','finanzas');
  UPDATE public.sub_brains SET sources='{pipedrive,holded,meta,gdrive,slack}', name='General', description='Visión global de la compañía: KPIs consolidados, OKRs y dirección.' WHERE id='general';
  UPDATE public.sub_brains SET sources='{pipedrive,salesforce,gmail}', name='Ventas', description='CRM, pipeline comercial, leads y previsión de cierre.' WHERE id='ventas';
  UPDATE public.sub_brains SET sources='{meta,ga,gdrive}', name='Marketing', description='Campañas, inversión publicitaria, atribución y métricas de adquisición.' WHERE id='marketing';
  UPDATE public.sub_brains SET sources='{holded,gmail,gdrive}', name='Finanzas', description='Facturación, ERP, conciliación bancaria y tesorería.' WHERE id='finanzas';
  UPDATE public.integrations SET connected = id NOT IN ('salesforce','slack'), last_sync = now();
  UPDATE public.processes SET active = id <> 'p-churn';
  UPDATE public.invoices SET status='overdue', reminders=0 WHERE status='overdue' OR id IN ('F-2026-0812','F-2026-0844','F-2026-0871','F-2026-0889','F-2026-0893','F-2026-0901');
  UPDATE public.invoices SET reminders=1 WHERE id='F-2026-0812';
  UPDATE public.invoices SET reminders=2 WHERE id='F-2026-0893';
  UPDATE public.campaigns SET status = CASE WHEN id='c-webinar' THEN 'paused' ELSE 'active' END;
  DELETE FROM public.activity;
  DELETE FROM public.chat_messages;
  DELETE FROM public.invitations;
  INSERT INTO public.activity(id,ts,actor,actor_name,type,sub_brain,status,summary,sources,duration_ms) VALUES
  ('evt_9f3a21',now()-interval '12 min','agent','Proc · Eficiencia de Campañas','Acción externa','marketing','ok','Análisis de CPA semanal completado sin incidencias.','{"Meta Ads","Google Analytics"}',8420),
  ('evt_0c8e55',now()-interval '1 day','agent','Proc · Generación de Leads B2B','Escritura CRM','ventas','ok','Creados 37 deals cualificados (score medio 78).','{Pipedrive,Gmail}',61200);
END $$;
REVOKE ALL ON FUNCTION public.reset_demo() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_demo() TO service_role;