-- Apply only to a dedicated Limpiarte project. No commercial rates are seeded.
create schema if not exists private;
revoke all on schema private from public;
create table public.quote_admins (
 user_id uuid primary key references auth.users(id),
 role text not null check (role in ('owner','editor','auditor')),
 active boolean not null default true
);
alter table public.quote_admins enable row level security;
revoke all on public.quote_admins from anon, authenticated;
create function private.quote_role() returns text language sql stable security definer set search_path = '' as $$
 select a.role from public.quote_admins a where a.user_id=(select auth.uid()) and a.active
 and (select auth.jwt()->>'aal')='aal2'
 and exists(select 1 from auth.sessions s where s.user_id=a.user_id and s.id::text=(select auth.jwt()->>'session_id'))
$$;
grant usage on schema private to authenticated;
revoke all on function private.quote_role() from public;
grant execute on function private.quote_role() to authenticated;
create table public.quote_versions (
 id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
 created_by uuid references auth.users(id), config jsonb not null check(jsonb_typeof(config)='object')
);
create table public.quote_settings (
 id integer primary key check(id=1), version_id uuid references public.quote_versions(id)
);
insert into public.quote_settings(id) values(1);
create table public.quote_requests (
 id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
 version_id uuid not null references public.quote_versions(id),
 idempotency_hash text not null unique, payload_hash text not null,
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
 contact jsonb not null check(jsonb_typeof(contact)='object'),
 consent_at timestamptz not null default now(), expires_at timestamptz not null,
 state text not null default 'Nueva' check(state in ('Nueva','Contactada','Cotizada','Aceptada','Rechazada','Finalizada')),
 revision integer not null default 1
);
create index quote_requests_created_idx on public.quote_requests(created_at desc,id);
create index quote_requests_state_created_idx on public.quote_requests(state,created_at desc);
create table public.quote_audit (
 id bigint generated always as identity primary key,
 created_at timestamptz not null default now(), actor uuid, action text not null,
 record_id uuid, detail jsonb not null
);
create index quote_audit_created_idx on public.quote_audit(created_at desc);
create table public.quote_rate_limits (
 key text primary key, count integer not null, expires_at timestamptz not null
);
create index quote_rate_limits_expiry_idx on public.quote_rate_limits(expires_at);
-- No anonymous table access. Administrative reads require live membership, MFA and session.
alter table public.quote_versions enable row level security;
alter table public.quote_settings enable row level security;
alter table public.quote_requests enable row level security;
alter table public.quote_audit enable row level security;
alter table public.quote_rate_limits enable row level security;
revoke all on public.quote_versions,public.quote_settings,public.quote_requests,public.quote_audit,public.quote_rate_limits from anon,authenticated;
grant select on public.quote_versions,public.quote_settings,public.quote_requests,public.quote_audit to authenticated;
grant insert on public.quote_versions to authenticated;
grant update(version_id) on public.quote_settings to authenticated;
grant update(state) on public.quote_requests to authenticated;
grant all on public.quote_admins,public.quote_versions,public.quote_settings,public.quote_requests,public.quote_audit,public.quote_rate_limits to service_role;
grant usage,select on sequence public.quote_audit_id_seq to service_role;
create policy version_read on public.quote_versions for select to authenticated using((select private.quote_role()) in ('owner','editor','auditor'));
create policy version_insert on public.quote_versions for insert to authenticated with check((select private.quote_role())='owner' and created_by=(select auth.uid()));
create policy settings_read on public.quote_settings for select to authenticated using((select private.quote_role()) in ('owner','editor','auditor'));
create policy settings_update on public.quote_settings for update to authenticated using((select private.quote_role())='owner') with check((select private.quote_role())='owner');
create policy request_read on public.quote_requests for select to authenticated using((select private.quote_role()) in ('owner','editor','auditor'));
create policy request_update on public.quote_requests for update to authenticated using((select private.quote_role()) in ('owner','editor')) with check((select private.quote_role()) in ('owner','editor'));
create policy audit_read on public.quote_audit for select to authenticated using((select private.quote_role()) in ('owner','auditor'));
create function private.quote_audit_change() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if tg_table_name='quote_versions' then
  insert into public.quote_audit(actor,action,record_id,detail) values(auth.uid(),'tariff_created',new.id,jsonb_build_object('version_id',new.id));
 elsif tg_table_name='quote_settings' then
  insert into public.quote_audit(actor,action,record_id,detail) values(auth.uid(),'tariff_published',new.version_id,jsonb_build_object('previous',old.version_id));
 elsif tg_op='INSERT' then
  insert into public.quote_audit(actor,action,record_id,detail) values(null,'request_created',new.id,jsonb_build_object('state',new.state));
 else
  insert into public.quote_audit(actor,action,record_id,detail) values(auth.uid(),'state_changed',new.id,jsonb_build_object('from',old.state,'to',new.state,'revision',new.revision));
 end if;
 return new;
end $$;
revoke all on function private.quote_audit_change() from public;
create trigger quote_version_audit after insert on public.quote_versions for each row execute function private.quote_audit_change();
create trigger quote_settings_audit after update on public.quote_settings for each row execute function private.quote_audit_change();
create trigger quote_request_audit after insert or update on public.quote_requests for each row execute function private.quote_audit_change();
create function private.quote_request_guard() returns trigger language plpgsql set search_path = '' as $$
begin
 if (to_jsonb(new)-'state'-'revision') is distinct from (to_jsonb(old)-'state'-'revision') then raise exception 'Immutable request snapshot'; end if;
 if not ((old.state='Nueva' and new.state in ('Contactada','Rechazada')) or
 (old.state='Contactada' and new.state in ('Cotizada','Rechazada')) or
 (old.state='Cotizada' and new.state in ('Aceptada','Rechazada')) or
 (old.state='Aceptada' and new.state in ('Finalizada','Rechazada'))) then raise exception 'Invalid state transition'; end if;
 new.revision=old.revision+1;
 return new;
end $$;
revoke all on function private.quote_request_guard() from public;
create trigger quote_request_guard before update on public.quote_requests for each row execute function private.quote_request_guard();
create function public.publish_quote_version(p_config jsonb,p_expected uuid) returns uuid language plpgsql security invoker set search_path = '' as $$
declare current_id uuid; new_id uuid;
begin
 if (select private.quote_role()) is distinct from 'owner' then raise exception 'Forbidden'; end if;
 select version_id into current_id from public.quote_settings where id=1 for update;
 if current_id is distinct from p_expected then raise exception 'Tariff conflict'; end if;
 if jsonb_typeof(p_config->'services') is distinct from 'array' or jsonb_typeof(p_config->'commercial') is distinct from 'object' or jsonb_typeof(p_config->'transport') is distinct from 'object' then raise exception 'Invalid config'; end if;
 insert into public.quote_versions(config,created_by) values(p_config,auth.uid()) returning id into new_id;
 update public.quote_settings set version_id=new_id where id=1;
 return new_id;
end $$;
revoke all on function public.publish_quote_version(jsonb,uuid) from public,anon;
grant execute on function public.publish_quote_version(jsonb,uuid) to authenticated;
create function public.consume_quote_limit(p_key text,p_limit integer) returns boolean language plpgsql security invoker set search_path = '' as $$
declare n integer;
begin
 if length(p_key)>200 or p_limit<1 or p_limit>1000 then raise exception 'Invalid limit'; end if;
 insert into public.quote_rate_limits(key,count,expires_at) values(p_key,1,now()+interval '2 hours')
 on conflict(key) do update set count=public.quote_rate_limits.count+1 returning count into n;
 return n<=p_limit;
end $$;
revoke all on function public.consume_quote_limit(text,integer) from public,anon,authenticated;
grant execute on function public.consume_quote_limit(text,integer) to service_role;
-- Schedule privileged housekeeping separately: delete expired quote_rate_limits only.
-- The active version and insertion are serialized with tariff publication.
create function public.save_quote_request(p_row jsonb) returns setof public.quote_requests language plpgsql security invoker set search_path = '' as $$
declare active_id uuid;
begin
 select version_id into active_id from public.quote_settings where id=1 for update;
 if active_id is distinct from (p_row->>'version_id')::uuid then raise exception 'Tariff conflict'; end if;
 insert into public.quote_requests(version_id,idempotency_hash,payload_hash,snapshot,contact,expires_at)
 values((p_row->>'version_id')::uuid,p_row->>'idempotency_hash',p_row->>'payload_hash',p_row->'snapshot',p_row->'contact',(p_row->>'expires_at')::timestamptz)
 on conflict(idempotency_hash) do nothing;
 return query select * from public.quote_requests where idempotency_hash=p_row->>'idempotency_hash';
end $$;
revoke all on function public.save_quote_request(jsonb) from public,anon,authenticated;
grant execute on function public.save_quote_request(jsonb) to service_role;
