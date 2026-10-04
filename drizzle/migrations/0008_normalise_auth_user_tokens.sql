-- GoTrue mapea estas columnas a un string de Go sin puntero, asi que un NULL en
-- cualquiera de ellas hace fallar el scan y el endpoint responde 500
-- ("Database error loading user") en lugar de 401. GoTrue siempre escribe ''
-- cuando crea un usuario, pero una fila insertada a mano (una restauracion de
-- backup, un seed) se queda con los NULL del dump y rompe el login.
--
-- Este trigger normaliza los tokens en cada INSERT/UPDATE de auth.users para
-- que el estado de la base no dependa de como se inserta la fila.
create or replace function public.normalise_auth_user_tokens()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.confirmation_token := coalesce(new.confirmation_token, '');
  new.recovery_token := coalesce(new.recovery_token, '');
  new.email_change_token_current := coalesce(new.email_change_token_current, '');
  new.email_change_token_new := coalesce(new.email_change_token_new, '');
  new.email_change := coalesce(new.email_change, '');
  new.email_change_confirm_status := coalesce(new.email_change_confirm_status, 0);
  new.phone_change := coalesce(new.phone_change, '');
  new.phone_change_token := coalesce(new.phone_change_token, '');
  new.reauthentication_token := coalesce(new.reauthentication_token, '');
  return new;
end;
$$;

drop trigger if exists auth_users_normalise_tokens on auth.users;

create trigger auth_users_normalise_tokens
before insert or update on auth.users
for each row execute function public.normalise_auth_user_tokens();