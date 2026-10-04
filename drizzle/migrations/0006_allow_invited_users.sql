CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE inv public.invitations; r public.app_role; first boolean; ctx text;
        owner_email text := COALESCE(NULLIF(current_setting('app.owner_email', true), ''), 'owner@example.com');
BEGIN
  IF COALESCE(NEW.raw_app_meta_data->>'provider','') <> 'google' THEN RAISE EXCEPTION 'Acceso no autorizado'; END IF;
  SELECT * INTO inv FROM public.invitations WHERE lower(email)=lower(NEW.email);
  IF lower(NEW.email) <> owner_email AND inv.email IS NULL THEN RAISE EXCEPTION 'Acceso no autorizado'; END IF;
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO first;
  r := CASE WHEN first OR lower(NEW.email)=owner_email THEN 'ADMIN'::public.app_role ELSE inv.role END;
  ctx := COALESCE(inv.expert_id, inv.sub_brain);
  INSERT INTO public.profiles(id,name,email,title) VALUES (NEW.id, COALESCE(NULLIF(inv.name,''), NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)), NEW.email, CASE WHEN r='ADMIN' AND inv.email IS NULL THEN 'Administrador' ELSE COALESCE(inv.title,'Miembro') END);
  INSERT INTO public.user_roles(user_id,role) VALUES (NEW.id, r);
  INSERT INTO public.expert_access(user_id, expert_id, access)
    SELECT NEW.id, e.id, CASE WHEN r='ADMIN' THEN 'exec' WHEN ctx = e.id THEN (CASE WHEN r='LECTOR' THEN 'read' ELSE 'exec' END) WHEN e.id='general' THEN 'read' ELSE 'none' END FROM public.experts e
    ON CONFLICT DO NOTHING;
  IF inv.email IS NOT NULL THEN DELETE FROM public.invitations WHERE email=inv.email; END IF;
  RETURN NEW;
END $function$;