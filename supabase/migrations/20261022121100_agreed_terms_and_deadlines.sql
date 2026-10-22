-- Preserve accepted terms and enforce a clear revision/deadline policy.
-- Legacy assignments deliberately retain an empty snapshot: historical agreement
-- cannot be reconstructed reliably from an editable live project.
alter table public.assignments
  add column agreed_brief jsonb not null default '{}'::jsonb
    check (jsonb_typeof(agreed_brief)='object' and octet_length(agreed_brief::text)<=100000),
  add column agreed_script text not null default '',
  add column delivery_deadline timestamptz;

create index assignments_open_deadline on public.assignments(delivery_deadline)
  where status in ('ACTIVE','REVISION');

-- The Storage API must remove uploaded bytes (SQL DELETE alone leaves orphans).
-- Only an unreferenced object can be removed by its uploader or by the Admin.
create policy submission_orphan_delete on storage.objects for delete to authenticated
  using (
    bucket_id='submissions' and private.is_active()
    and split_part(name,'/',1)=(select auth.uid())::text
    and not exists(select 1 from public.submissions s where s.storage_path=name)
  );
create policy project_media_orphan_delete on storage.objects for delete to authenticated
  using (
    bucket_id='project-media' and private.is_admin()
    and not exists(select 1 from public.project_media m where m.storage_path=name)
  );

-- Keep the previous dispatcher; compose the new rules around its locks,
-- role checks, auditing, payment transitions and existing operations.
alter function private.mutate(text,uuid,jsonb) rename to mutate_phase1;
create function private.mutate(op text,target uuid,payload jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  result uuid;
  actor uuid:=auth.uid();
  p public.projects;
  w public.assignments;
  s public.submissions;
  requested_deadline timestamptz;
  revision_cap integer;
begin
  if actor is null or not private.is_active() then
    raise exception 'Account unavailable';
  end if;
  if op='extend_deadline' then
    if not private.is_admin() then raise exception 'Admin required'; end if;
    select * into w from public.assignments where id=target for update;
    if w.id is null or w.status='APPROVED' then raise exception 'Assignment unavailable for extension'; end if;
    if coalesce(payload->>'deadline','')='' then raise exception 'Select a valid delivery deadline'; end if;
    requested_deadline:=(payload->>'deadline')::timestamptz;
    if requested_deadline<=now() or requested_deadline>now()+interval '366 days'
       or (w.delivery_deadline is not null and requested_deadline<=w.delivery_deadline)
    then raise exception 'Extension must be a later future deadline within one year'; end if;
    update public.assignments set delivery_deadline=requested_deadline where id=target;
    insert into public.notifications(creator_id,message) values(w.creator_id,'Delivery deadline extended');
    insert into public.audit_logs(actor_id,action,target_id) values(actor,op,target);
    return target;
  end if;
  if op='project' and target is not null then
    select * into p from public.projects where id=target for update;
    if p.id is not null and exists(select 1 from public.assignments where project_id=target) then
      if p.title is distinct from payload->>'title'
        or p.description is distinct from payload->>'description'
        or p.kind is distinct from payload->>'kind'
        or p.payment_paise is distinct from (payload->>'payment_paise')::bigint
        or p.instructions is distinct from payload->>'instructions'
        or p.language is distinct from payload->>'language'
        or p.usage_terms is distinct from payload->>'usage_terms'
        or p.capacity is distinct from (payload->>'capacity')::integer
        or p.deadline is distinct from (payload->>'deadline')::timestamptz
        or p.details is distinct from coalesce(payload->'details','{}'::jsonb)
        or (select script from public.project_scripts where project_id=target)
             is distinct from coalesce(payload->>'script','')
      then raise exception 'Accepted brief terms are locked'; end if;
    end if;
  elsif op='submit' then
    select * into w from public.assignments where id=target for update;
    if w.id is not null and w.creator_id=actor then
      if w.delivery_deadline is not null and now()>w.delivery_deadline then
        raise exception 'Delivery deadline passed';
      end if;
      if exists(select 1 from public.shipping
                where assignment_id=target and status<>'DELIVERED') then
        raise exception 'Confirm product delivery before submitting';
      end if;
    end if;
  elsif op='review' and payload->>'status'='REVISION' then
    select * into s from public.submissions where id=target for update;
    if s.id is not null then
      select * into w from public.assignments where id=s.assignment_id for update;
      revision_cap:=coalesce(
        nullif(w.agreed_brief->'details'->>'revision_limit','')::integer,
        (select nullif(details->>'revision_limit','')::integer
         from public.projects where id=w.project_id),
        1
      );
      if (select count(*) from public.submissions
          where assignment_id=w.id and status='REVISION')>=revision_cap then
        raise exception 'Revision limit reached';
      end if;
    end if;
  end if;
  result:=private.mutate_phase1(op,target,payload);
  if op='decision' and payload->>'status'='APPROVED' then
    update public.assignments a
    set agreed_brief=jsonb_build_object(
      'title',p.title,'description',p.description,'kind',p.kind,
      'payment_paise',p.payment_paise,'instructions',p.instructions,
      'language',p.language,'usage_terms',p.usage_terms,
      'capacity',p.capacity,'deadline',p.deadline,'details',p.details
    ),
    agreed_script=coalesce(ps.script,''),
    delivery_deadline=nullif(p.details->>'delivery_deadline','')::timestamptz
    from public.projects p
    left join public.project_scripts ps on ps.project_id=p.id
    where a.id=result and a.project_id=p.id;
  end if;
  return result;
end $$;
revoke all on function private.mutate(text,uuid,jsonb) from public,anon;
grant execute on function private.mutate(text,uuid,jsonb) to authenticated;
create or replace function public.workflow(op text,target uuid default null,payload jsonb default '{}')
returns uuid language sql security invoker set search_path='' as $$
  select private.mutate(op,target,payload)
$$;
