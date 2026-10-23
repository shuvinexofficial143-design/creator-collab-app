-- Active Admin-only, database-wide searchable queues. SECURITY INVOKER keeps
-- PostgreSQL grants and existing row-level security in effect.
create function public.admin_find_pending(
  queue_kind text,
  search_term text default '',
  page_number integer default 1,
  page_size integer default 25
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  query_text text := lower(trim(coalesce(search_term, '')));
  matched bigint;
  records jsonb;
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception 'Admin required';
  end if;
  if char_length(query_text) > 80 then raise exception 'Search too long'; end if;
  if page_number is null or page_number < 1 or page_number > 1000
    or page_size is null or page_size < 1 or page_size > 50 then
    raise exception 'Invalid pagination';
  end if;
  if queue_kind = 'applications' then
    select count(*) into matched
    from public.applications a
    join public.projects p on p.id = a.project_id
    join public.profiles c on c.id = a.creator_id
    where a.status = 'PENDING'
      and (query_text = '' or position(query_text in lower(concat_ws(' ',a.note,p.title,c.full_name))) > 0);
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into records
    from (
      select a.id,a.project_id,a.creator_id,a.note,a.status,a.created_at,
        p.title as project_title,c.full_name as creator_name
      from public.applications a
      join public.projects p on p.id = a.project_id
      join public.profiles c on c.id = a.creator_id
      where a.status = 'PENDING'
        and (query_text = '' or position(query_text in lower(concat_ws(' ',a.note,p.title,c.full_name))) > 0)
      order by a.created_at desc,a.id desc
      limit page_size offset ((page_number - 1) * page_size)
    ) t;
  elsif queue_kind = 'submissions' then
    select count(*) into matched
    from public.submissions s
    join public.assignments w on w.id = s.assignment_id
    join public.projects p on p.id = w.project_id
    join public.profiles c on c.id = w.creator_id
    where s.status = 'SUBMITTED'
      and (query_text = '' or position(query_text in lower(concat_ws(' ',s.note,p.title,c.full_name))) > 0);
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into records
    from (
      select s.id,s.assignment_id,s.storage_path,s.note,s.status,s.created_at,
        p.kind as media_kind,p.title as project_title,c.full_name as creator_name
      from public.submissions s
      join public.assignments w on w.id = s.assignment_id
      join public.projects p on p.id = w.project_id
      join public.profiles c on c.id = w.creator_id
      where s.status = 'SUBMITTED'
        and (query_text = '' or position(query_text in lower(concat_ws(' ',s.note,p.title,c.full_name))) > 0)
      order by s.created_at desc,s.id desc
      limit page_size offset ((page_number - 1) * page_size)
    ) t;
  else
    raise exception 'Invalid queue';
  end if;
  return jsonb_build_object('total',matched,'items',records,'page',page_number,'page_size',page_size);
end $$;
revoke all on function public.admin_find_pending(text,text,integer,integer) from public,anon;
grant execute on function public.admin_find_pending(text,text,integer,integer) to authenticated;
