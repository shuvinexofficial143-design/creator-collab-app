-- RLS-preserving, database-side totals; do not sum only the first PostgREST 1,000 rows.
-- This is SECURITY INVOKER: the calling creator sees ONLY their own RLS-visible rows,
-- while an active Admin sees aggregate business totals under existing policies.
create function public.workspace_metrics()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_active() then
    raise exception 'Account unavailable';
  end if;
  return jsonb_build_object(
    'pending_applications', (select count(*) from public.applications where status='PENDING'),
    'active_assignments', (select count(*) from public.assignments where status <> 'APPROVED'),
    'awaiting_review', (select count(*) from public.submissions where status='SUBMITTED'),
    'outstanding_payments', (select count(*) from public.payments where status <> 'PAID'),
    'payable_count', (select count(*) from public.payments),
    'approved_earnings_paise', (select coalesce(sum(amount_paise),0) from public.payments),
    'pending_earnings_paise', (select coalesce(sum(amount_paise),0) from public.payments where status <> 'PAID'),
    'paid_earnings_paise', (select coalesce(sum(amount_paise),0) from public.payments where status='PAID')
  );
end;
$$;
revoke all on function public.workspace_metrics() from public, anon;
grant execute on function public.workspace_metrics() to authenticated;
