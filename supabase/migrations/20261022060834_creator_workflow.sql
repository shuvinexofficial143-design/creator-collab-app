create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
create table public.profiles(id uuid primary key references auth.users on delete cascade, full_name text not null default '', role text not null default 'CREATOR' check(role in ('ADMIN','CREATOR')), active boolean not null default true, created_at timestamptz not null default now());
create function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='ADMIN' and active) $$;
create function private.is_active() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.profiles where id=auth.uid() and active) $$;
create function private.new_user() returns trigger language plpgsql security definer set search_path='' as $$ begin insert into public.profiles(id,full_name) values(new.id,left(coalesce(new.raw_user_meta_data->>'full_name',''),120)); return new; end $$;
create trigger create_profile after insert on auth.users for each row execute function private.new_user();
create table public.projects(id uuid primary key default gen_random_uuid(), title text not null check(length(title) between 3 and 160),description text not null,kind text not null check(kind in ('PRODUCT','VOICE')), payment_paise bigint not null check(payment_paise between 0 and 100000000),instructions text not null default '',language text not null default 'Hindi',usage_terms text not null,capacity int not null default 1 check(capacity between 1 and 100),deadline timestamptz not null,status text not null default 'DRAFT' check(status in ('DRAFT','PUBLISHED','CLOSED','ARCHIVED')),created_at timestamptz not null default now());
create table public.project_scripts(project_id uuid primary key references public.projects on delete cascade,script text not null default '');
create table public.applications(id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects,creator_id uuid not null references public.profiles,note text not null check(length(note) between 10 and 2000),status text not null default 'PENDING' check(status in ('PENDING','APPROVED','REJECTED')),reason text,created_at timestamptz not null default now(),unique(project_id,creator_id));
create table public.assignments(id uuid primary key default gen_random_uuid(),application_id uuid not null unique references public.applications,project_id uuid not null references public.projects,creator_id uuid not null references public.profiles,payment_paise bigint not null check(payment_paise>=0),status text not null default 'ACTIVE' check(status in ('ACTIVE','SUBMITTED','REVISION','APPROVED')),created_at timestamptz not null default now());
create table public.shipping(assignment_id uuid primary key references public.assignments,address text not null default '',courier text not null default '',tracking text not null default '',status text not null default 'ADDRESS_REQUIRED' check(status in ('ADDRESS_REQUIRED','READY','DISPATCHED','DELIVERED')));
create table public.submissions(id uuid primary key default gen_random_uuid(),assignment_id uuid not null references public.assignments,storage_path text not null unique,note text not null default '',review text,status text not null default 'SUBMITTED' check(status in ('SUBMITTED','REVISION','APPROVED')),created_at timestamptz not null default now());
create table public.payments(id uuid primary key default gen_random_uuid(),assignment_id uuid not null unique references public.assignments,creator_id uuid not null references public.profiles,amount_paise bigint not null check(amount_paise>=0),status text not null default 'PENDING' check(status in ('PENDING','PROCESSING','PAID')),reference text,paid_at timestamptz,check(status<>'PAID' or (length(trim(coalesce(reference,'')))>=3 and paid_at is not null)));
create table public.notifications(id uuid primary key default gen_random_uuid(),creator_id uuid not null references public.profiles,message text not null,created_at timestamptz not null default now());
create table public.audit_logs(id bigint generated always as identity primary key,actor_id uuid not null references public.profiles,action text not null,target_id uuid not null,created_at timestamptz not null default now());
create index applications_creator on public.applications(creator_id);
create index applications_project_status on public.applications(project_id,status);
create index assignments_creator on public.assignments(creator_id);
create index assignments_project on public.assignments(project_id);
create index submissions_assignment on public.submissions(assignment_id,created_at desc);
create index payments_creator on public.payments(creator_id);
create index notifications_creator on public.notifications(creator_id,created_at desc);
create function private.owns_assignment(target uuid) returns boolean language sql stable security definer set search_path='' as $$ select private.is_active() and exists(select 1 from public.assignments where id=target and creator_id=auth.uid()) $$;
-- Direct table writes are revoked. All mutations below validate actor and transitions atomically.
do $$ declare t text; begin foreach t in array array['profiles','projects','project_scripts','applications','assignments','shipping','submissions','payments','notifications','audit_logs'] loop execute format('alter table public.%I enable row level security',t); execute format('revoke all on public.%I from anon, authenticated',t); execute format('grant select on public.%I to authenticated',t); execute format('create policy admin_read on public.%I for select to authenticated using ((select private.is_admin()))',t); end loop; end $$;
create policy own_profile on public.profiles for select to authenticated using(id=auth.uid());
create policy available_projects on public.projects for select to authenticated using(private.is_active() and (status='PUBLISHED' or exists(select 1 from public.assignments where project_id=projects.id and creator_id=auth.uid())));
create policy assigned_script on public.project_scripts for select to authenticated using(private.is_active() and exists(select 1 from public.assignments where project_id=project_scripts.project_id and creator_id=auth.uid()));
create policy own_applications on public.applications for select to authenticated using(creator_id=auth.uid() and private.is_active());
create policy own_assignments on public.assignments for select to authenticated using(creator_id=auth.uid() and private.is_active());
create policy own_shipping on public.shipping for select to authenticated using(private.owns_assignment(assignment_id));
create policy own_submissions on public.submissions for select to authenticated using(private.owns_assignment(assignment_id));
create policy own_payments on public.payments for select to authenticated using(creator_id=auth.uid() and private.is_active());
create policy own_notifications on public.notifications for select to authenticated using(creator_id=auth.uid() and private.is_active());
create function private.mutate(op text,target uuid,payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); p public.projects; a public.applications; w public.assignments; s public.submissions; result uuid; recipient uuid; notice text;
begin
 if actor is null or not private.is_active() then raise exception 'Account unavailable'; end if;
 if op in ('project','decision','review','payment','dispatch') and not private.is_admin() then raise exception 'Admin required'; end if;
 if op='profile' then
 update public.profiles set full_name=left(trim(payload->>'full_name'),120) where id=actor; return actor;
 elsif op='project' then
 if target is null then target:=gen_random_uuid(); end if;
 insert into public.projects(id,title,description,kind,payment_paise,instructions,language,usage_terms,capacity,deadline,status) values(target,payload->>'title',payload->>'description',payload->>'kind',(payload->>'payment_paise')::bigint,payload->>'instructions',payload->>'language',payload->>'usage_terms',(payload->>'capacity')::int,(payload->>'deadline')::timestamptz,payload->>'status')
 on conflict(id) do update set title=excluded.title,description=excluded.description,instructions=excluded.instructions,language=excluded.language,usage_terms=excluded.usage_terms,deadline=excluded.deadline,status=excluded.status,capacity=excluded.capacity,payment_paise=excluded.payment_paise;
 insert into public.project_scripts values(target,coalesce(payload->>'script','')) on conflict(project_id) do update set script=excluded.script;
 result:=target;
 elsif op='apply' then
 select * into p from public.projects where id=target for update;
 if p.id is null or p.status<>'PUBLISHED' or p.deadline<=now() then raise exception 'Applications are closed'; end if;
 if private.is_admin() then raise exception 'Use a creator account to apply'; end if;
 insert into public.applications(project_id,creator_id,note) values(target,actor,payload->>'note') returning id into result;
 elsif op='decision' then
 select * into a from public.applications where id=target for update;
 if a.id is null or a.status<>'PENDING' then raise exception 'Application is not pending'; end if;
 if payload->>'status' not in ('APPROVED','REJECTED') then raise exception 'Invalid decision'; end if;
 if payload->>'status'='APPROVED' then
 select * into p from public.projects where id=a.project_id for update;
 if p.status<>'PUBLISHED' or (select count(*) from public.assignments where project_id=p.id)>=p.capacity then raise exception 'Project is closed or full'; end if;
 insert into public.assignments(application_id,project_id,creator_id,payment_paise) values(a.id,p.id,a.creator_id,p.payment_paise) returning id into result;
 if p.kind='PRODUCT' then insert into public.shipping(assignment_id) values(result); end if;
 else
 if length(trim(coalesce(payload->>'reason','')))<3 then raise exception 'Rejection reason required'; end if;
 end if;
 update public.applications set status=payload->>'status',reason=payload->>'reason' where id=target;
 recipient:=a.creator_id; notice:='Application '||(payload->>'status');
 elsif op in ('address','delivered','dispatch','submit') then
 select * into w from public.assignments where id=target for update;
 if w.id is null or (not private.is_admin() and w.creator_id<>actor) then raise exception 'Assignment unavailable'; end if;
 recipient:=w.creator_id;
 if op='address' then
 if length(trim(coalesce(payload->>'address','')))<15 then raise exception 'Complete delivery address required'; end if;
 update public.shipping set address=left(payload->>'address',2000),status='READY' where assignment_id=target and status in ('ADDRESS_REQUIRED','READY');
 if not found then raise exception 'Address cannot be changed after dispatch'; end if;
 elsif op='dispatch' then
 if length(trim(coalesce(payload->>'courier','')))<2 or length(trim(coalesce(payload->>'tracking','')))<2 then raise exception 'Courier and tracking required'; end if;
 update public.shipping set courier=payload->>'courier',tracking=payload->>'tracking',status='DISPATCHED' where assignment_id=target and status='READY';
 if not found then raise exception 'Delivery address required before dispatch'; end if; notice:='Product dispatched';
 elsif op='delivered' then
 update public.shipping set status='DELIVERED' where assignment_id=target and status='DISPATCHED';
 if not found then raise exception 'Product has not been dispatched'; end if;
 else
 if w.creator_id<>actor or w.status not in ('ACTIVE','REVISION') then raise exception 'Assignment is not accepting submissions'; end if;
 if split_part(payload->>'storage_path','/',1)<>actor::text or split_part(payload->>'storage_path','/',2)<>target::text then raise exception 'Invalid upload path'; end if;
 if not exists(select 1 from storage.objects where bucket_id='submissions' and name=payload->>'storage_path') then raise exception 'Upload the file first'; end if;
 insert into public.submissions(assignment_id,storage_path,note) values(target,payload->>'storage_path',left(coalesce(payload->>'note',''),2000)) returning id into result;
 update public.assignments set status='SUBMITTED' where id=target;
 end if;
 elsif op='review' then
 select * into s from public.submissions where id=target for update;
 if s.id is null or s.status<>'SUBMITTED' then raise exception 'Submission is not awaiting review'; end if;
 select * into w from public.assignments where id=s.assignment_id for update;
 if w.status<>'SUBMITTED' then raise exception 'Assignment is not awaiting review'; end if;
 if payload->>'status' not in ('REVISION','APPROVED') then raise exception 'Invalid review'; end if;
 if payload->>'status'='REVISION' and length(trim(coalesce(payload->>'reason','')))<3 then raise exception 'Revision instructions required'; end if;
 update public.submissions set status=payload->>'status',review=left(payload->>'reason',5000) where id=target;
 update public.assignments set status=payload->>'status' where id=w.id;
 if payload->>'status'='APPROVED' then insert into public.payments(assignment_id,creator_id,amount_paise) values(w.id,w.creator_id,w.payment_paise); end if;
 recipient:=w.creator_id; notice:='Work '||(payload->>'status');
 elsif op='payment' then
 if payload->>'status' not in ('PROCESSING','PAID') then raise exception 'Invalid payment status'; end if;
 update public.payments set status=payload->>'status',reference=payload->>'reference',paid_at=case when payload->>'status'='PAID' then now() else null end where id=target and status in ('PENDING','PROCESSING') returning creator_id into recipient;
 if not found then raise exception 'Payment already paid or unavailable'; end if;
 notice:='Payment '||(payload->>'status');
 else raise exception 'Unknown operation'; end if;
 if notice is not null then insert into public.notifications(creator_id,message) values(recipient,notice); end if;
 insert into public.audit_logs(actor_id,action,target_id) values(actor,op,coalesce(target,result));
 return coalesce(result,target);
end $$;
revoke all on all functions in schema private from public,anon;
grant execute on function private.is_admin(),private.is_active(),private.owns_assignment(uuid),private.mutate(text,uuid,jsonb) to authenticated;
create function public.workflow(op text,target uuid default null,payload jsonb default '{}') returns uuid language sql security invoker set search_path='' as $$ select private.mutate(op,target,payload) $$;
revoke all on function public.workflow(text,uuid,jsonb) from public,anon;
grant execute on function public.workflow(text,uuid,jsonb) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('submissions','submissions',false,104857600,array['video/mp4','video/webm','audio/mpeg','audio/wav','audio/x-wav','audio/mp4','audio/ogg']);
create policy submission_read on storage.objects for select to authenticated using(bucket_id='submissions' and (private.is_admin() or (private.is_active() and split_part(name,'/',1)=auth.uid()::text)));
create policy submission_upload on storage.objects for insert to authenticated with check(bucket_id='submissions' and private.is_active() and split_part(name,'/',1)=auth.uid()::text and exists(select 1 from public.assignments where id::text=split_part(name,'/',2) and creator_id=auth.uid() and status in ('ACTIVE','REVISION')));
