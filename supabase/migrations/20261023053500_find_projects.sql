-- RLS-aware project discovery with literal full-database search and exact counts.
-- No dynamic SQL, no role bypass, and no elevated service client.
create function public.find_projects(
  kind_filter text default 'ALL',
  search_term text default '',
  status_filter text default 'ALL',
  page_number integer default 1,
  page_size integer default 20
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  phrase text := lower(trim(coalesce(search_term, '')));
  matched bigint;
  records jsonb;
begin
  if auth.uid() is null or not private.is_active() then
    raise exception 'Account unavailable';
  end if;
  if kind_filter is null or kind_filter not in ('ALL','VOICE','PRODUCT') then raise exception 'Invalid project type'; end if;
  if status_filter is null or status_filter not in ('ALL','DRAFT','PUBLISHED','CLOSED','ARCHIVED') then raise exception 'Invalid project status'; end if;
  if char_length(phrase)>80 then raise exception 'Search too long'; end if;
  if page_number is null or page_number<1 or page_number>500
    or page_size is null or page_size<1 or page_size>50 then raise exception 'Invalid pagination'; end if;
  select count(*) into matched from public.projects p
  where (kind_filter='ALL' or p.kind=kind_filter)
    and (status_filter='ALL' or p.status=status_filter)
    and (phrase='' or position(phrase in lower(concat_ws(' ',p.title,p.description,p.language)))>0);
  select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into records from (
    select p.id,p.title,p.description,p.kind,p.status,p.payment_paise,
      p.language,p.capacity,p.deadline,p.created_at
    from public.projects p
    where (kind_filter='ALL' or p.kind=kind_filter)
      and (status_filter='ALL' or p.status=status_filter)
      and (phrase='' or position(phrase in lower(concat_ws(' ',p.title,p.description,p.language)))>0)
    order by p.created_at desc,p.id desc
    limit page_size offset ((page_number-1)*page_size)
  ) t;
  return jsonb_build_object('total',matched,'items',records,'page',page_number,'page_size',page_size);
end $$;
revoke all on function public.find_projects(text,text,text,integer,integer) from public,anon;
grant execute on function public.find_projects(text,text,text,integer,integer) to authenticated;
