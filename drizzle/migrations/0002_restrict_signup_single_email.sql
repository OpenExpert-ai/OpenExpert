-- Owner email is read from the `app.owner_email` Postgres setting so no
-- personal address lives in the repository. Configure it per environment:
--   ALTER DATABASE postgres SET app.owner_email = 'owner@example.com';
-- Falls back to the placeholder below when the setting is absent.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE inv public.invitations; r public.app_role; first boolean;
        owner_email text := COALESCE(NULLIF(current_setting('app.owner_email', true), ''), 'owner@example.com');
BEGIN
  IF lower(NEW.email) <> owner_email OR COALESCE(NEW.raw_app_meta_data->>'provider','') <> 'google' THEN
    RAISE EXCEPTION 'Acceso no autorizado';
  END IF;
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO first;
  SELECT * INTO inv FROM public.invitations WHERE lower(email)=lower(NEW.email);
  r := CASE WHEN first THEN 'ADMIN'::public.app_role WHEN inv.email IS NOT NULL THEN inv.role ELSE 'LECTOR'::public.app_role END;
  INSERT INTO public.profiles(id,name,email,title) VALUES (NEW.id, COALESCE(NULLIF(inv.name,''), NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)), NEW.email, CASE WHEN first THEN 'Administrador' ELSE COALESCE(inv.title,'Miembro') END);
  INSERT INTO public.user_roles(user_id,role) VALUES (NEW.id, r);
  INSERT INTO public.sub_brain_access(user_id, sub_brain_id, access)
    SELECT NEW.id, sb.id, CASE WHEN r='ADMIN' THEN 'exec' WHEN inv.sub_brain = sb.id THEN (CASE WHEN r='LECTOR' THEN 'read' ELSE 'exec' END) WHEN sb.id='general' THEN 'read' ELSE 'none' END FROM public.sub_brains sb;
  IF inv.email IS NOT NULL THEN DELETE FROM public.invitations WHERE email=inv.email; END IF;
  RETURN NEW;
END $function$;