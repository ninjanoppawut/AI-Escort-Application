begin;

-- P15-01: every admin console view is gated by an active platform_admins
-- grant and an aal2 session (ADM-001), and every successful view is audited
-- (ADM-009). Denials return a stable code instead of raising so the page can
-- show the right recovery (sign in, MFA, or refusal).

create function public.open_admin_console(view_key text)
returns table (
  outcome text,
  error_code text,
  admin_user_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
begin
  if view_key is null
    or view_key not in ('home', 'health', 'users', 'schools', 'errors', 'audit', 'incidents')
  then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text, null::uuid;
    return;
  end if;

  begin
    actor := private.require_current_admin_aal2();
  exception
    when insufficient_privilege then
      return query select 'denied'::text, sqlerrm::text, null::uuid;
      return;
  end;

  perform private.insert_audit_log(
    actor,
    'admin.console.viewed',
    'admin_view',
    null,
    null,
    null,
    'succeeded',
    jsonb_build_object('view', view_key)
  );

  return query select 'ok'::text, null::text, actor;
end;
$$;

revoke all on function public.open_admin_console(text) from public, anon;
grant execute on function public.open_admin_console(text) to authenticated;

comment on function public.open_admin_console(text) is
  'P15-01: admin grant + aal2 gate for one console view; audits each successful view.';

commit;
