-- Invitation functions: create / replace / revoke / preview / accept.
--
-- WHY: clients cannot insert invitations or add themselves to a trip (RLS and grants forbid it, correctly).
-- Instead of giving the web server the service-role key (a god-mode secret that bypasses all RLS), each
-- operation is a SECURITY DEFINER function that checks WHO is calling (auth.uid()) and WHAT they may do,
-- then performs the change in ONE transaction. Nothing about RLS or the table grants is loosened.
--
-- Every function: search_path = '' and fully-qualified names; EXECUTE is revoked from public/anon and granted
-- only to the roles that need it. Only the SHA-256 hash of a link ever reaches the database.
-- Errors are raised as short, stable codes (not_found, invite_used, ...) that the API maps to HTTP responses.

-- ---------------------------------------------------------------------------------------------------------
-- Derived state. Expiry is computed from expires_at (never trust a stored status for that).
-- Internal helper: not callable by API roles.
-- ---------------------------------------------------------------------------------------------------------
create function public.invite_state(p_status text, p_expires_at timestamptz)
returns text
language sql stable set search_path = '' as $$
  select case
    when p_status = 'joined'  then 'used'
    when p_status = 'revoked' then 'revoked'
    when p_expires_at <= now() then 'expired'
    else 'valid'
  end
$$;

-- ---------------------------------------------------------------------------------------------------------
-- create_invitation: the trip's organiser makes a one-time link (7-day expiry via the column default).
-- ---------------------------------------------------------------------------------------------------------
create function public.create_invitation(p_trip uuid, p_invitee_name text, p_token_hash text)
returns table (id uuid, invitee_name text, status text, email_status text, expires_at timestamptz, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_invitee_name, ''));
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  -- A non-organiser (member or stranger) gets the same answer as a trip that does not exist.
  if not exists (select 1 from public.trips t where t.id = p_trip and t.organiser_id = v_uid) then
    raise exception 'not_found';
  end if;
  if char_length(v_name) not between 1 and 60 then raise exception 'invalid_name'; end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_token'; end if;
  if (select count(*) from public.invitations i where i.trip_id = p_trip and i.status <> 'revoked') >= 30 then
    raise exception 'too_many_invites';
  end if;

  return query
    insert into public.invitations (trip_id, invitee_name, token_hash, created_by)
    values (p_trip, v_name, p_token_hash, v_uid)
    returning invitations.id, invitations.invitee_name, invitations.status, invitations.email_status,
              invitations.expires_at, invitations.created_at;
end $$;

-- ---------------------------------------------------------------------------------------------------------
-- replace_invitation: revoke the old link and issue a new one for the same person, atomically.
-- ---------------------------------------------------------------------------------------------------------
create function public.replace_invitation(p_trip uuid, p_invitation uuid, p_token_hash text)
returns table (id uuid, invitee_name text, status text, email_status text, expires_at timestamptz, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_old public.invitations%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.trips t where t.id = p_trip and t.organiser_id = v_uid) then
    raise exception 'not_found';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_token'; end if;

  select * into v_old from public.invitations i where i.id = p_invitation and i.trip_id = p_trip for update;
  if not found then raise exception 'not_found'; end if;
  if v_old.status = 'joined' then raise exception 'already_joined'; end if;

  update public.invitations i set status = 'revoked' where i.id = v_old.id and i.status = 'pending';

  return query
    insert into public.invitations (trip_id, invitee_name, token_hash, created_by)
    values (p_trip, v_old.invitee_name, p_token_hash, v_uid)
    returning invitations.id, invitations.invitee_name, invitations.status, invitations.email_status,
              invitations.expires_at, invitations.created_at;
end $$;

-- ---------------------------------------------------------------------------------------------------------
-- revoke_invitation: the organiser cancels a pending link.
-- ---------------------------------------------------------------------------------------------------------
create function public.revoke_invitation(p_trip uuid, p_invitation uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_old public.invitations%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.trips t where t.id = p_trip and t.organiser_id = v_uid) then
    raise exception 'not_found';
  end if;
  select * into v_old from public.invitations i where i.id = p_invitation and i.trip_id = p_trip for update;
  if not found then raise exception 'not_found'; end if;
  if v_old.status = 'joined' then raise exception 'already_joined'; end if;
  update public.invitations i set status = 'revoked' where i.id = v_old.id and i.status = 'pending';
end $$;

-- ---------------------------------------------------------------------------------------------------------
-- invitation_preview: what the public landing page may show. Callable WITHOUT a login.
-- Dead links (used / revoked / expired / unknown / malformed) reveal only their state.
-- A live link reveals only: invitee name, organiser FIRST name, trip name, destination, dates, crew size.
-- trip_id is returned only when the caller is already a member of that trip.
-- ---------------------------------------------------------------------------------------------------------
create function public.invitation_preview(p_token_hash text)
returns table (state text, invitee_name text, organiser text, trip_name text, destination text,
               start_date date, end_date date, crew_in int, member boolean, trip_id uuid)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid    uuid := (select auth.uid());
  v_inv    public.invitations%rowtype;
  v_state  text;
  v_member boolean := false;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return query select 'invalid'::text, null::text, null::text, null::text, null::text, null::date, null::date, null::int, false, null::uuid;
    return;
  end if;
  select * into v_inv from public.invitations i where i.token_hash = p_token_hash;
  if not found then
    return query select 'invalid'::text, null::text, null::text, null::text, null::text, null::date, null::date, null::int, false, null::uuid;
    return;
  end if;
  v_state := public.invite_state(v_inv.status, v_inv.expires_at);
  if v_state <> 'valid' then
    return query select v_state, null::text, null::text, null::text, null::text, null::date, null::date, null::int, false, null::uuid;
    return;
  end if;
  if v_uid is not null then
    v_member := exists (select 1 from public.trip_members m where m.trip_id = v_inv.trip_id and m.user_id = v_uid);
  end if;

  return query
    select 'valid'::text,
           v_inv.invitee_name,
           coalesce(nullif(split_part(btrim(p.display_name), ' ', 1), ''), 'Someone'),
           tr.name,
           tr.destination,
           tr.start_date,
           tr.end_date,
           (select count(*)::int from public.trip_members m where m.trip_id = v_inv.trip_id),
           v_member,
           case when v_member then v_inv.trip_id end
      from public.trips tr
      join public.profiles p on p.id = v_inv.created_by
     where tr.id = v_inv.trip_id;
end $$;

-- ---------------------------------------------------------------------------------------------------------
-- accept_invitation: the signed-in person joins the trip. ONE transaction, with the invitation row locked,
-- so two people can never both use one link and a half-finished join can never be left behind.
--   - already a member            -> returns (trip_id, true); the link is NOT consumed
--   - used / revoked / expired     -> raises invite_used / invite_revoked / invite_expired
--   - unknown / malformed          -> raises invite_invalid
-- ---------------------------------------------------------------------------------------------------------
create function public.accept_invitation(p_token_hash text)
returns table (trip_id uuid, already_member boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := (select auth.uid());
  v_inv   public.invitations%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'invite_invalid'; end if;

  select * into v_inv from public.invitations i where i.token_hash = p_token_hash for update;
  if not found then raise exception 'invite_invalid'; end if;

  if exists (select 1 from public.trip_members m where m.trip_id = v_inv.trip_id and m.user_id = v_uid) then
    return query select v_inv.trip_id, true;
    return;
  end if;

  case public.invite_state(v_inv.status, v_inv.expires_at)
    when 'used'    then raise exception 'invite_used';
    when 'revoked' then raise exception 'invite_revoked';
    when 'expired' then raise exception 'invite_expired';
    else null;
  end case;

  insert into public.trip_members (trip_id, user_id, role) values (v_inv.trip_id, v_uid, 'member');
  update public.invitations i set status = 'joined', used_by = v_uid, used_at = now() where i.id = v_inv.id;

  return query select v_inv.trip_id, false;
end $$;

-- ---------------------------------------------------------------------------------------------------------
-- Privileges: nothing is executable by default. Only these grants exist.
-- ---------------------------------------------------------------------------------------------------------
revoke all on function public.invite_state(text, timestamptz)              from public, anon, authenticated;
revoke all on function public.create_invitation(uuid, text, text)          from public, anon, authenticated;
revoke all on function public.replace_invitation(uuid, uuid, text)         from public, anon, authenticated;
revoke all on function public.revoke_invitation(uuid, uuid)                from public, anon, authenticated;
revoke all on function public.invitation_preview(text)                     from public, anon, authenticated;
revoke all on function public.accept_invitation(text)                      from public, anon, authenticated;

grant execute on function public.create_invitation(uuid, text, text)       to authenticated;
grant execute on function public.replace_invitation(uuid, uuid, text)      to authenticated;
grant execute on function public.revoke_invitation(uuid, uuid)             to authenticated;
grant execute on function public.accept_invitation(text)                   to authenticated;
-- The landing page works before anyone has an account:
grant execute on function public.invitation_preview(text)                  to anon, authenticated;
