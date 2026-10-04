ALTER TABLE public.activity ALTER COLUMN sub_brain SET DEFAULT 'general';
ALTER TABLE public.chat_messages ALTER COLUMN sub_brain SET DEFAULT 'general';
ALTER TABLE public.processes ALTER COLUMN sub_brain SET DEFAULT 'general';
ALTER TABLE public.invitations ALTER COLUMN sub_brain SET DEFAULT 'general';
CREATE OR REPLACE FUNCTION public.sync_expert_context() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.expert_id := COALESCE(NEW.expert_id, NEW.sub_brain);
    NEW.sub_brain := NEW.expert_id;
  ELSIF NEW.expert_id IS DISTINCT FROM OLD.expert_id THEN
    NEW.sub_brain := NEW.expert_id;
  ELSIF NEW.sub_brain IS DISTINCT FROM OLD.sub_brain THEN
    NEW.expert_id := NEW.sub_brain;
  END IF;
  RETURN NEW;
END $$;