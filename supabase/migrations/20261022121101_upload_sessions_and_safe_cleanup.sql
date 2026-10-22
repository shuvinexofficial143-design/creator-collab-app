-- The CLI timestamp preceded the existing Phase 2 migration. This migration's
-- version was advanced by one second after that migration to preserve ordering.
create table public.upload_sessions (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles,
 bucket text not null check(bucket in ('submissions','project-media')), path text not null,
 target_id uuid, fingerprint text, mime_type text, byte_size bigint,
 payload jsonb not null default '{}' check(octet_length(payload::text)<=5000),
 state text not null default 'OPEN' check(state in ('OPEN','LINKED','CLEANUP','DELETED')),
 lease_until timestamptz not null default now()+interval '30 minutes',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 claimed_by uuid references public.profiles, claim_id uuid, last_error text, attempts int not null default 0,
 unique(bucket,path)
);
create unique index upload_recovery_identity on public.upload_sessions(owner_id,bucket,target_id,fingerprint) where state='OPEN';
create index upload_cleanup_state on public.upload_sessions(state,lease_until);
alter table public.upload_sessions enable row level security;
revoke all on public.upload_sessions from anon,authenticated;
grant select on public.upload_sessions to authenticated;
create policy upload_session_read on public.upload_sessions for select to authenticated
 using(private.is_active() and (owner_id=auth.uid() or private.is_admin()));

create function private.object_linked(b text,p text) returns boolean language sql stable security definer set search_path='' as $$
 select case b when 'submissions' then exists(select 1 from public.submissions where storage_path=p)
 when 'project-media' then exists(select 1 from public.project_media where storage_path=p) else true end
$$;
-- All attachment writes and cleanup claims use the same transaction lock. A
-- claimed path is a permanent tombstone: it can never become referenced later.
create function private.guard_attachment() returns trigger language plpgsql security definer set search_path='' as $$
declare b text; u public.upload_sessions;
begin
 b:=case TG_TABLE_NAME when 'submissions' then 'submissions' else 'project-media' end;
 perform pg_advisory_xact_lock(hashtextextended(b||':'||new.storage_path,0));
 select * into u from public.upload_sessions where bucket=b and path=new.storage_path for update;
 if u.id is not null then
  if u.state<>'OPEN' then raise exception 'Upload is no longer available for attachment'; end if;
  if u.owner_id is distinct from auth.uid() then raise exception 'Upload owner mismatch'; end if;
  if not exists(select 1 from storage.objects o where o.bucket_id=b and o.name=new.storage_path and (o.metadata->>'size')::bigint=u.byte_size and o.metadata->>'mimetype'=u.mime_type) then raise exception 'Uploaded file metadata does not match the registered file'; end if;
  if b='submissions' and u.target_id is distinct from (to_jsonb(new)->>'assignment_id')::uuid then raise exception 'Upload target mismatch'; end if;
  if b='project-media' and u.target_id is distinct from (to_jsonb(new)->>'project_id')::uuid then raise exception 'Upload target mismatch'; end if;
  update public.upload_sessions set state='LINKED',updated_at=now() where id=u.id;
 end if;
 return new;
end $$;
create trigger submission_attachment_guard before insert on public.submissions for each row execute function private.guard_attachment();
create trigger media_attachment_guard before insert on public.project_media for each row execute function private.guard_attachment();

create function private.can_upload(b text,p text) returns boolean language plpgsql security definer set search_path='' as $$
declare u public.upload_sessions;
begin
 if auth.uid() is null or not private.is_active() then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended(b||':'||p,0));
 select * into u from public.upload_sessions where bucket=b and path=p;
 if u.id is null or u.owner_id<>auth.uid() or u.state<>'OPEN' or u.lease_until<=now() then return false; end if;
 if b='project-media' then return private.is_admin(); end if;
 return exists(select 1 from public.assignments a where a.id=u.target_id and a.creator_id=auth.uid() and a.status in ('ACTIVE','REVISION') and (a.delivery_deadline is null or a.delivery_deadline>=now()) and not exists(select 1 from public.shipping s where s.assignment_id=a.id and s.status<>'DELIVERED'));
end $$;
drop policy submission_upload on storage.objects;
drop policy project_media_upload on storage.objects;
create policy leased_upload on storage.objects for insert to authenticated with check(private.can_upload(bucket_id,name));
-- No upsert policy: completed bytes cannot be replaced under a referenced path.
drop policy submission_orphan_delete on storage.objects;
drop policy project_media_orphan_delete on storage.objects;
create function private.can_cleanup(b text,p text) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_admin() and not private.object_linked(b,p) and exists(select 1 from public.upload_sessions where bucket=b and path=p and state='CLEANUP' and claimed_by=auth.uid())
$$;
create policy claimed_cleanup_delete on storage.objects for delete to authenticated using(private.can_cleanup(bucket_id,name));

create function private.upload_control(op text,session_id uuid,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u public.upload_sessions; w public.assignments; b text; t uuid; p text; mime text; bytes bigint; result jsonb; obj storage.objects; token uuid;
begin
 if auth.uid() is null or not private.is_active() then raise exception 'Account unavailable'; end if;
 if op='begin' then
  b:=upload_control.payload->>'bucket';t:=(upload_control.payload->>'target')::uuid;mime:=upload_control.payload->>'mime';bytes:=(upload_control.payload->>'size')::bigint;
  if b is null or b not in ('submissions','project-media') or t is null or coalesce(upload_control.payload->>'fingerprint','') !~ '^[a-f0-9]{64}$' or bytes is null or bytes<=0 then raise exception 'Invalid upload'; end if;
  if b='submissions' then
   select * into w from public.assignments where id=t and creator_id=auth.uid();
   if w.id is null or w.status not in ('ACTIVE','REVISION') then raise exception 'Assignment is not accepting submissions'; end if;
   if w.delivery_deadline<now() then raise exception 'Delivery deadline passed'; end if;
   if exists(select 1 from public.shipping where assignment_id=t and status<>'DELIVERED') then raise exception 'Confirm product delivery before submitting'; end if;
   if bytes>104857600 or mime is null or not exists(select 1 from public.projects where id=w.project_id and ((kind='VOICE' and mime in ('audio/mpeg','audio/wav','audio/mp4','audio/ogg')) or (kind='PRODUCT' and mime in ('video/mp4','video/webm')))) then raise exception 'Unsupported file type or size'; end if;
  else
   if not private.is_admin() then raise exception 'Admin required'; end if;
   if not exists(select 1 from public.projects where id=t) or bytes>52428800 or mime is null or mime not in ('image/jpeg','image/png','image/webp','video/mp4','video/webm','audio/mpeg','audio/wav','audio/mp4','audio/ogg') then raise exception 'Unsupported file type or size'; end if;
  end if;
  -- Serialize identical begin requests across tabs without holding assignment locks.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||b||t::text||(upload_control.payload->>'fingerprint'),0));
  select * into u from public.upload_sessions where owner_id=auth.uid() and bucket=b and target_id=t and fingerprint=upload_control.payload->>'fingerprint' and state='OPEN' for update;
  if u.id is null then
   if (select count(*) from public.upload_sessions where owner_id=auth.uid() and state='OPEN')>=20 then raise exception 'Too many unfinished uploads; ask the Admin to review cleanup'; end if;
   token:=gen_random_uuid();p:=case when b='submissions' then auth.uid()::text||'/' else '' end||t::text||'/'||token::text;
   insert into public.upload_sessions(id,owner_id,bucket,path,target_id,fingerprint,mime_type,byte_size,payload) values(token,auth.uid(),b,p,t,upload_control.payload->>'fingerprint',mime,bytes,jsonb_build_object('note',left(coalesce(upload_control.payload->>'note',''),2000),'caption',left(coalesce(upload_control.payload->>'caption',''),200))) returning * into u;
  else
   update public.upload_sessions set lease_until=now()+interval '30 minutes',updated_at=now() where id=u.id returning * into u;
  end if;
  return to_jsonb(u);
 elsif op in ('heartbeat','status') then
  select * into u from public.upload_sessions where id=session_id and owner_id=auth.uid() for update;
  if u.id is null then raise exception 'Upload unavailable'; end if;
  if op='heartbeat' then
   if u.state<>'OPEN' then raise exception 'Upload is no longer active'; end if;
   update public.upload_sessions set lease_until=now()+interval '30 minutes',updated_at=now() where id=u.id returning * into u;
  end if;
  return to_jsonb(u)||jsonb_build_object('object_exists',exists(select 1 from storage.objects where bucket_id=u.bucket and name=u.path),'linked',private.object_linked(u.bucket,u.path));
 elsif op='preview' then
  if not private.is_admin() then raise exception 'Admin required'; end if;
  select coalesce(jsonb_agg(to_jsonb(c)),'[]') into result from (
   select o.id as object_id,o.bucket_id as bucket,o.name as path,o.created_at,o.updated_at,us.id as session_id,us.state,us.last_error,us.attempts
   from storage.objects o left join public.upload_sessions us on us.bucket=o.bucket_id and us.path=o.name
   where o.bucket_id in ('submissions','project-media') and o.created_at<now()-interval '24 hours' and coalesce(o.updated_at,o.created_at)<now()-interval '24 hours'
   and not private.object_linked(o.bucket_id,o.name)
   and (us.id is null or (us.state in ('OPEN','CLEANUP') and us.lease_until<now()-interval '1 hour'))
   order by o.created_at,o.id limit 100
  ) c;
  return result;
 elsif op='claim' then
  if not private.is_admin() then raise exception 'Admin required'; end if;
  if upload_control.payload->>'confirmation' is distinct from 'DELETE UNREFERENCED FILE' then raise exception 'Explicit cleanup confirmation required'; end if;
  b:=upload_control.payload->>'bucket';p:=upload_control.payload->>'path';
  if b is null or b not in ('submissions','project-media') or p is null then raise exception 'Invalid cleanup target'; end if;
  perform pg_advisory_xact_lock(hashtextextended(b||':'||p,0));
  select * into obj from storage.objects where bucket_id=b and name=p and id=(upload_control.payload->>'object_id')::uuid for update;
  select * into u from public.upload_sessions where bucket=b and path=p for update;
  if obj.id is null or obj.created_at>=now()-interval '24 hours' or coalesce(obj.updated_at,obj.created_at)>=now()-interval '24 hours' or private.object_linked(b,p) then raise exception 'Object is no longer a cleanup candidate'; end if;
  if u.id is not null and (u.state not in ('OPEN','CLEANUP') or u.lease_until>=now()-interval '1 hour') then raise exception 'Upload is active or already linked'; end if;
  token:=gen_random_uuid();
  insert into public.upload_sessions(owner_id,bucket,path,state,lease_until,claimed_by,claim_id,attempts)
   values(auth.uid(),b,p,'CLEANUP',now()-interval '2 hours',auth.uid(),token,1)
   on conflict(bucket,path) do update set state='CLEANUP',claimed_by=auth.uid(),claim_id=token,attempts=public.upload_sessions.attempts+1,updated_at=now(),last_error=null returning * into u;
  insert into public.audit_logs(actor_id,action,target_id) values(auth.uid(),'cleanup_claim',u.id);
  return to_jsonb(u);
 elsif op='cleanup_result' then
  if not private.is_admin() then raise exception 'Admin required'; end if;
  select * into u from public.upload_sessions where id=session_id and state='CLEANUP' and claimed_by=auth.uid() and claim_id=(upload_control.payload->>'claim_id')::uuid for update;
  if u.id is null then raise exception 'Cleanup claim unavailable'; end if;
  if not exists(select 1 from storage.objects where bucket_id=u.bucket and name=u.path) then
   update public.upload_sessions set state='DELETED',updated_at=now(),last_error=null where id=u.id;
   insert into public.audit_logs(actor_id,action,target_id) values(auth.uid(),'cleanup_deleted',u.id);
   return jsonb_build_object('deleted',true);
  end if;
  update public.upload_sessions set last_error='Storage removal not confirmed; retry from cleanup preview',updated_at=now() where id=u.id;
  insert into public.audit_logs(actor_id,action,target_id) values(auth.uid(),'cleanup_failed',u.id);
  return jsonb_build_object('deleted',false);
 else raise exception 'Unknown upload operation'; end if;
end $$;

-- Old finalize RPCs remain valid. Attachment triggers guard every path, including
-- callers of workflow; old privileged dispatchers stay revoked from Phase 2.
create function public.upload_control(op text,session_id uuid default null,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.upload_control(op,session_id,payload)$$;
revoke all on function public.upload_control(text,uuid,jsonb) from public,anon;
revoke all on function private.upload_control(text,uuid,jsonb),private.can_upload(text,text),private.can_cleanup(text,text),private.object_linked(text,text),private.guard_attachment() from public,anon,authenticated;
grant execute on function public.upload_control(text,uuid,jsonb),private.upload_control(text,uuid,jsonb),private.can_upload(text,text),private.can_cleanup(text,text) to authenticated;
-- Expand reference audio types consistently with creator uploads.
alter table public.project_media drop constraint project_media_mime_type_check;
alter table public.project_media add constraint project_media_mime_type_check check(mime_type in ('image/jpeg','image/png','image/webp','video/mp4','video/webm','audio/mpeg','audio/wav','audio/mp4','audio/ogg'));
update storage.buckets set allowed_mime_types=array['image/jpeg','image/png','image/webp','video/mp4','video/webm','audio/mpeg','audio/wav','audio/mp4','audio/ogg'] where id='project-media';
