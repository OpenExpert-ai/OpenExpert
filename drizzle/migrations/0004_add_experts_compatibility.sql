CREATE TABLE public.experts (id text PRIMARY KEY, name text NOT NULL, description text NOT NULL DEFAULT '', sources text[] NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.experts TO authenticated;
GRANT ALL ON public.experts TO service_role;
ALTER TABLE public.experts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read experts" ON public.experts FOR SELECT TO authenticated USING (true);
INSERT INTO public.experts (id,name,description,sources,created_at) SELECT id,name,description,sources,created_at FROM public.sub_brains;

CREATE TABLE public.expert_access (user_id uuid NOT NULL, expert_id text NOT NULL REFERENCES public.experts(id) ON DELETE CASCADE, access text NOT NULL DEFAULT 'none', PRIMARY KEY(user_id,expert_id));
GRANT SELECT ON public.expert_access TO authenticated;
GRANT ALL ON public.expert_access TO service_role;
ALTER TABLE public.expert_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read expert access" ON public.expert_access FOR SELECT TO authenticated USING (true);
INSERT INTO public.expert_access (user_id,expert_id,access) SELECT user_id,sub_brain_id,access FROM public.sub_brain_access;

ALTER TABLE public.processes ADD COLUMN expert_id text;
ALTER TABLE public.activity ADD COLUMN expert_id text;
ALTER TABLE public.invitations ADD COLUMN expert_id text;
ALTER TABLE public.chat_messages ADD COLUMN expert_id text;
UPDATE public.processes SET expert_id=sub_brain WHERE expert_id IS NULL;
UPDATE public.activity SET expert_id=sub_brain WHERE expert_id IS NULL;
UPDATE public.invitations SET expert_id=sub_brain WHERE expert_id IS NULL;
UPDATE public.chat_messages SET expert_id=sub_brain WHERE expert_id IS NULL;
CREATE INDEX chat_messages_expert_conversation_idx ON public.chat_messages(user_id,expert_id,conversation_id,created_at);
COMMENT ON COLUMN public.processes.sub_brain IS 'DEPRECATED: compatibility mirror of expert_id';
COMMENT ON COLUMN public.activity.sub_brain IS 'DEPRECATED: compatibility mirror of expert_id';
COMMENT ON COLUMN public.invitations.sub_brain IS 'DEPRECATED: compatibility mirror of expert_id';
COMMENT ON COLUMN public.chat_messages.sub_brain IS 'DEPRECATED: compatibility mirror of expert_id';
COMMENT ON TABLE public.sub_brains IS 'DEPRECATED: compatibility mirror of experts';
COMMENT ON TABLE public.sub_brain_access IS 'DEPRECATED: compatibility mirror of expert_access';

CREATE FUNCTION public.sync_expert_context() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.expert_id := COALESCE(NEW.expert_id, NEW.sub_brain);
    NEW.sub_brain := COALESCE(NEW.sub_brain, NEW.expert_id);
  ELSIF NEW.expert_id IS DISTINCT FROM OLD.expert_id THEN
    NEW.sub_brain := NEW.expert_id;
  ELSIF NEW.sub_brain IS DISTINCT FROM OLD.sub_brain THEN
    NEW.expert_id := NEW.sub_brain;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sync_process_expert BEFORE INSERT OR UPDATE ON public.processes FOR EACH ROW EXECUTE FUNCTION public.sync_expert_context();
CREATE TRIGGER sync_activity_expert BEFORE INSERT OR UPDATE ON public.activity FOR EACH ROW EXECUTE FUNCTION public.sync_expert_context();
CREATE TRIGGER sync_invitation_expert BEFORE INSERT OR UPDATE ON public.invitations FOR EACH ROW EXECUTE FUNCTION public.sync_expert_context();
CREATE TRIGGER sync_chat_expert BEFORE INSERT OR UPDATE ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION public.sync_expert_context();

CREATE FUNCTION public.mirror_expert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'experts' THEN
    INSERT INTO public.sub_brains(id,name,description,sources,created_at) VALUES (NEW.id,NEW.name,NEW.description,NEW.sources,NEW.created_at) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,sources=EXCLUDED.sources;
  ELSE
    INSERT INTO public.experts(id,name,description,sources,created_at) VALUES (NEW.id,NEW.name,NEW.description,NEW.sources,NEW.created_at) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,sources=EXCLUDED.sources;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER mirror_expert_new AFTER INSERT OR UPDATE ON public.experts FOR EACH ROW EXECUTE FUNCTION public.mirror_expert();
CREATE TRIGGER mirror_expert_legacy AFTER INSERT OR UPDATE ON public.sub_brains FOR EACH ROW EXECUTE FUNCTION public.mirror_expert();
CREATE FUNCTION public.mirror_expert_access() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN COALESCE(NEW,OLD); END IF;
  IF TG_TABLE_NAME = 'expert_access' THEN
    IF TG_OP = 'DELETE' THEN DELETE FROM public.sub_brain_access WHERE user_id=OLD.user_id AND sub_brain_id=OLD.expert_id;
    ELSE INSERT INTO public.sub_brain_access(user_id,sub_brain_id,access) VALUES (NEW.user_id,NEW.expert_id,NEW.access) ON CONFLICT(user_id,sub_brain_id) DO UPDATE SET access=EXCLUDED.access; END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN DELETE FROM public.expert_access WHERE user_id=OLD.user_id AND expert_id=OLD.sub_brain_id;
    ELSE INSERT INTO public.expert_access(user_id,expert_id,access) VALUES (NEW.user_id,NEW.sub_brain_id,NEW.access) ON CONFLICT(user_id,expert_id) DO UPDATE SET access=EXCLUDED.access; END IF;
  END IF;
  RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER mirror_access_new AFTER INSERT OR UPDATE OR DELETE ON public.expert_access FOR EACH ROW EXECUTE FUNCTION public.mirror_expert_access();
CREATE TRIGGER mirror_access_legacy AFTER INSERT OR UPDATE OR DELETE ON public.sub_brain_access FOR EACH ROW EXECUTE FUNCTION public.mirror_expert_access();