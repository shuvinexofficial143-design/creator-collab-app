alter table public.projects add column details jsonb not null default '{}' check(jsonb_typeof(details)='object' and octet_length(details::text)<=20000);
alter table public.notifications add column read_at timestamptz;
create table public.project_media(id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects,storage_path text not null unique,mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp','video/mp4','video/webm','audio/mpeg','audio/wav')),caption text not null default '',created_at timestamptz not null default now());
alter table public.project_media enable row level security;
revoke all on public.project_media from anon,authenticated;
grant select on public.project_media to authenticated;
create policy project_media_read on public.project_media for select to authenticated using(exists(select 1 from public.projects where id=project_id));
create index project_media_project on public.project_media(project_id);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('project-media','project-media',false,52428800,array['image/jpeg','image/png','image/webp','video/mp4','video/webm','audio/mpeg','audio/wav']);
create policy project_media_upload on storage.objects for insert to authenticated with check(bucket_id='project-media' and private.is_admin() and exists(select 1 from public.projects where id::text=split_part(name,'/',1)));
create policy project_media_file_read on storage.objects for select to authenticated using(bucket_id='project-media' and private.is_active() and exists(select 1 from public.projects where id::text=split_part(name,'/',1)));
alter function private.mutate(text,uuid,jsonb) rename to mutate_core;
create function private.mutate(op text,target uuid,payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; actor uuid:=auth.uid();
begin
 if actor is null or not private.is_active() then raise exception 'Account unavailable'; end if;
 if op='read_notification' then
 update public.notifications set read_at=now() where id=target and creator_id=actor;
 if not found then raise exception 'Notification unavailable'; end if;
 return target;
 elsif op='creator_status' then
 if not private.is_admin() then raise exception 'Admin required'; end if;
 update public.profiles set active=(payload->>'active')::boolean where id=target and role='CREATOR';
 if not found then raise exception 'Creator unavailable'; end if;
 elsif op='media' then
 if not private.is_admin() then raise exception 'Admin required'; end if;
 if split_part(payload->>'storage_path','/',1)<>target::text then raise exception 'Invalid media path'; end if;
 if not exists(select 1 from storage.objects where bucket_id='project-media' and name=payload->>'storage_path') then raise exception 'Upload the media first'; end if;
 insert into public.project_media(project_id,storage_path,mime_type,caption) values(target,payload->>'storage_path',payload->>'mime_type',left(coalesce(payload->>'caption',''),200)) returning id into result;
 else
 if op='project' and payload ? 'details' then
 if (payload->'details'->>'duration_seconds')::int not between 1 and 36000 or (payload->'details'->>'revision_limit')::int not between 0 and 20 then raise exception 'Invalid project details'; end if;
 if (payload->'details'->>'delivery_deadline')::timestamptz <= (payload->>'deadline')::timestamptz then raise exception 'Delivery must follow application deadline'; end if;
 end if;
 result:=private.mutate_core(op,target,payload);
 if op='decision' and payload->>'status'='APPROVED' then
 delete from public.shipping where assignment_id=result and exists(select 1 from public.assignments a join public.projects p on p.id=a.project_id where a.id=result and p.details->>'shipping_required'='false');
 end if;
 if op='project' then update public.projects set details=coalesce(payload->'details','{}'::jsonb) where id=result; end if;
 return result;
 end if;
 insert into public.audit_logs(actor_id,action,target_id) values(actor,op,target);
 return coalesce(result,target);
end $$;
revoke all on function private.mutate(text,uuid,jsonb) from public,anon;
grant execute on function private.mutate(text,uuid,jsonb) to authenticated;
-- Rebind the wrapper after renaming the old dispatcher.
create or replace function public.workflow(op text,target uuid default null,payload jsonb default '{}') returns uuid language sql security invoker set search_path='' as $$ select private.mutate(op,target,payload) $$;
