CREATE TABLE public.google_tokens (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text,
  expires_at timestamptz NOT NULL,
  scopes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Server-only: tokens are read and written exclusively through the service-role
-- client in src/lib/drive-tokens.server.ts, so no authenticated policy is granted.
GRANT ALL ON public.google_tokens TO service_role;
ALTER TABLE public.google_tokens ENABLE ROW LEVEL SECURITY;

CREATE INDEX google_tokens_expires_at_idx ON public.google_tokens(expires_at);
