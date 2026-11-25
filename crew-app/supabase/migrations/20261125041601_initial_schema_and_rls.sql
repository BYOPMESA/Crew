create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  created_at   timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id,
          coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
                   split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.trips (
  id            uuid primary key default gen_random_uuid(),
  organiser_id  uuid not null references public.profiles(id),
  name          text not null check (char_length(name) between 1 and 80),
  crew_name     text check (char_length(crew_name) <= 80),
  destination   text,
  dest_lat      double precision,
  dest_lon      double precision,
  start_date    date,
  end_date      date,
  expected_size int  check (expected_size between 1 and 20),
  notes         text check (char_length(notes) <= 1000),
  status        text not null default 'planning' check (status in ('planning','voting','closed')),
  created_at    timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index on public.trips (organiser_id);

create table public.trip_members (
  trip_id   uuid not null references public.trips(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  role      text not null check (role in ('organiser','member')),
  joined_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);
create index on public.trip_members (user_id);

create function public.is_trip_member(p_trip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.trip_members
                 where trip_id = p_trip and user_id = (select auth.uid()));
$$;

create function public.is_trip_organiser(p_trip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.trips
                 where id = p_trip and organiser_id = (select auth.uid()));
$$;

create function public.shares_trip_with(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.trip_members a
                 join public.trip_members b on a.trip_id = b.trip_id
                 where a.user_id = (select auth.uid()) and b.user_id = p_user);
$$;

create function public.add_organiser_member() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.trip_members (trip_id, user_id, role)
  values (new.id, new.organiser_id, 'organiser');
  return new;
end $$;
create trigger trips_add_organiser after insert on public.trips
  for each row execute function public.add_organiser_member();

create table public.preferences (
  trip_id     uuid not null,
  user_id     uuid not null,
  interests   text[] not null default '{}',
  vibe        text check (vibe in ('chill','balanced','packed')),
  stay_styles text[] not null default '{}',
  must_visit  text check (char_length(must_visit) <= 120),
  updated_at  timestamptz not null default now(),
  primary key (trip_id, user_id),
  foreign key (trip_id, user_id) references public.trip_members (trip_id, user_id) on delete cascade
);

create table public.member_budgets (
  trip_id      uuid not null,
  user_id      uuid not null,
  amount_minor bigint not null check (amount_minor > 0),
  updated_at   timestamptz not null default now(),
  primary key (trip_id, user_id),
  foreign key (trip_id, user_id) references public.trip_members (trip_id, user_id) on delete cascade
);

create function public.crew_budget(p_trip uuid)
returns table (average_minor bigint, submitted int, expected int)
language plpgsql stable security definer set search_path = '' as $$
declare n int; mine boolean; avg_v numeric; exp_n int;
begin
  if not public.is_trip_member(p_trip) then
    raise exception 'not a member of this trip' using errcode = '42501';
  end if;
  select count(*), avg(amount_minor), coalesce(bool_or(user_id = (select auth.uid())), false)
    into n, avg_v, mine
    from public.member_budgets where trip_id = p_trip;
  select expected_size into exp_n from public.trips where id = p_trip;
  if n = 0 or (n = 1 and not mine) then
    return query select null::bigint, n, exp_n;
  else
    return query select round(avg_v)::bigint, n, exp_n;
  end if;
end $$;

create function public.trip_progress(p_trip uuid)
returns table (user_id uuid, display_name text, role text, has_preferences boolean, has_budget boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_trip_member(p_trip) then
    raise exception 'not a member of this trip' using errcode = '42501';
  end if;
  return query
    select m.user_id, p.display_name, m.role,
           exists (select 1 from public.preferences x where x.trip_id = m.trip_id and x.user_id = m.user_id),
           exists (select 1 from public.member_budgets b where b.trip_id = m.trip_id and b.user_id = m.user_id)
      from public.trip_members m join public.profiles p on p.id = m.user_id
     where m.trip_id = p_trip order by m.joined_at;
end $$;

create table public.invitations (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references public.trips(id) on delete cascade,
  invitee_name text not null check (char_length(invitee_name) between 1 and 60),
  email        text,
  token_hash   text not null unique,
  status       text not null default 'pending' check (status in ('pending','joined','revoked','expired')),
  email_status text not null default 'not_sent' check (email_status in ('not_sent','sent','failed')),
  expires_at   timestamptz not null default now() + interval '7 days',
  created_by   uuid not null references public.profiles(id),
  used_by      uuid references public.profiles(id),
  used_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index on public.invitations (trip_id);
create index on public.invitations (created_by);
create index on public.invitations (used_by);

create table public.places (
  id                uuid primary key default gen_random_uuid(),
  source            text not null check (source in ('osm','wikidata','manual')),
  source_id         text not null,
  name              text not null,
  category          text,
  lat               double precision,
  lon               double precision,
  wikidata          text,
  photo_url         text,
  photo_license     text,
  photo_attribution text,
  tags              jsonb not null default '{}',
  fetched_at        timestamptz not null default now(),
  unique (source, source_id)
);

create table public.plans (
  id                    uuid primary key default gen_random_uuid(),
  trip_id               uuid not null references public.trips(id) on delete cascade,
  version               int  not null default 1,
  status                text not null default 'draft' check (status in ('draft','voting','closed')),
  stale                 boolean not null default false,
  budget_snapshot_minor bigint,
  generated_by          text not null default 'open_data' check (generated_by in ('open_data','llm')),
  created_at            timestamptz not null default now(),
  unique (trip_id, version)
);

create function public.plan_trip(p_plan uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select trip_id from public.plans where id = p_plan;
$$;
create function public.plan_status(p_plan uuid) returns text
language sql stable security definer set search_path = '' as $$
  select status from public.plans where id = p_plan;
$$;

create table public.plan_options (
  id             uuid primary key default gen_random_uuid(),
  plan_id        uuid not null references public.plans(id) on delete cascade,
  day            int  not null check (day >= 1),
  block          text not null check (block in ('morning','afternoon','evening')),
  position       int  not null default 0,
  place_id       uuid references public.places(id),
  title          text not null,
  source_url     text,
  est_cost_minor bigint check (est_cost_minor >= 0),
  selected       boolean not null default false
);
create index on public.plan_options (plan_id, day, block);
create index on public.plan_options (place_id);

create table public.votes (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references public.plans(id) on delete cascade,
  user_id    uuid not null references public.profiles(id),
  choice     text not null check (choice in ('yes','change')),
  comment    text check (char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  unique (plan_id, user_id)
);
create index on public.votes (user_id);

create table public.trip_candidates (
  id                uuid primary key default gen_random_uuid(),
  trip_id           uuid not null references public.trips(id) on delete cascade,
  kind              text not null check (kind in ('stay','experience')),
  place_id          uuid references public.places(id),
  name              text not null,
  area              text,
  typed_price_minor bigint check (typed_price_minor >= 0),
  link              text,
  added_by          uuid not null references public.profiles(id),
  shortlisted       boolean not null default false,
  created_at        timestamptz not null default now()
);
create index on public.trip_candidates (trip_id, kind);
create index on public.trip_candidates (added_by);
create index on public.trip_candidates (place_id);

create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references public.trips(id) on delete cascade,
  payer_id     uuid not null,
  description  text not null check (char_length(description) between 1 and 120),
  amount_minor bigint not null check (amount_minor > 0),
  category     text not null check (category in ('Stay','Food','Travel','Activities','Other')),
  created_by   uuid not null references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (trip_id, payer_id) references public.trip_members (trip_id, user_id)
);
create index on public.expenses (trip_id);
create index on public.expenses (trip_id, payer_id);
create index on public.expenses (created_by);

create table public.expense_splits (
  expense_id  uuid not null references public.expenses(id) on delete cascade,
  user_id     uuid not null references public.profiles(id),
  share_minor bigint not null check (share_minor >= 0),
  primary key (expense_id, user_id)
);
create index on public.expense_splits (user_id);

create table public.settlements (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references public.trips(id) on delete cascade,
  from_user    uuid not null references public.profiles(id),
  to_user      uuid not null references public.profiles(id),
  amount_minor bigint not null check (amount_minor > 0),
  status       text not null default 'paid' check (status in ('paid','undone')),
  created_by   uuid not null references public.profiles(id),
  created_at   timestamptz not null default now(),
  undone_at    timestamptz,
  undone_by    uuid references public.profiles(id),
  check (from_user <> to_user)
);
create index on public.settlements (trip_id);
create index on public.settlements (from_user);
create index on public.settlements (to_user);
create index on public.settlements (created_by);
create index on public.settlements (undone_by);

create table public.reminder_settings (
  trip_id    uuid primary key references public.trips(id) on delete cascade,
  enabled    boolean not null default false,
  frequency  text not null default '48h' check (frequency in ('24h','48h','weekly')),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
create index on public.reminder_settings (updated_by);

create table public.reminder_log (
  id       uuid primary key default gen_random_uuid(),
  trip_id  uuid not null references public.trips(id) on delete cascade,
  user_id  uuid not null references public.profiles(id),
  kind     text not null check (kind in ('preferences','vote')),
  channel  text not null default 'in_app' check (channel in ('in_app','email')),
  status   text not null check (status in ('sent','failed')),
  sent_at  timestamptz not null default now()
);
create index on public.reminder_log (trip_id);
create index on public.reminder_log (user_id);

create table public.ai_jobs (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips(id) on delete cascade,
  kind        text not null check (kind in ('destination_ideas','plan')),
  status      text not null default 'queued' check (status in ('queued','running','done','failed')),
  result      jsonb,
  error       text,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);
create index on public.ai_jobs (trip_id, kind);
create index on public.ai_jobs (created_by);

alter table public.profiles          enable row level security;
alter table public.trips             enable row level security;
alter table public.trip_members      enable row level security;
alter table public.preferences       enable row level security;
alter table public.member_budgets    enable row level security;
alter table public.invitations       enable row level security;
alter table public.places            enable row level security;
alter table public.plans             enable row level security;
alter table public.plan_options      enable row level security;
alter table public.votes             enable row level security;
alter table public.trip_candidates   enable row level security;
alter table public.expenses          enable row level security;
alter table public.expense_splits    enable row level security;
alter table public.settlements       enable row level security;
alter table public.reminder_settings enable row level security;
alter table public.reminder_log      enable row level security;
alter table public.ai_jobs           enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_trip_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy trips_select on public.trips for select to authenticated
  using (organiser_id = (select auth.uid()) or public.is_trip_member(id));
create policy trips_insert on public.trips for insert to authenticated
  with check (organiser_id = (select auth.uid()));
create policy trips_update on public.trips for update to authenticated
  using (public.is_trip_organiser(id)) with check (public.is_trip_organiser(id));
create policy trips_delete on public.trips for delete to authenticated
  using (public.is_trip_organiser(id));

create policy members_select on public.trip_members for select to authenticated
  using (public.is_trip_member(trip_id));

create policy prefs_select on public.preferences for select to authenticated
  using (user_id = (select auth.uid()));
create policy prefs_insert on public.preferences for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_trip_member(trip_id));
create policy prefs_update on public.preferences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy budgets_select on public.member_budgets for select to authenticated
  using (user_id = (select auth.uid()));
create policy budgets_insert on public.member_budgets for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_trip_member(trip_id));
create policy budgets_update on public.member_budgets for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy invitations_select on public.invitations for select to authenticated
  using (public.is_trip_member(trip_id));

create policy places_select on public.places for select to authenticated using (true);

create policy plans_select on public.plans for select to authenticated
  using (public.is_trip_member(trip_id));
create policy plans_insert on public.plans for insert to authenticated
  with check (public.is_trip_organiser(trip_id));
create policy plans_update on public.plans for update to authenticated
  using (public.is_trip_organiser(trip_id)) with check (public.is_trip_organiser(trip_id));

create policy options_select on public.plan_options for select to authenticated
  using (public.is_trip_member(public.plan_trip(plan_id)));
create policy options_write on public.plan_options for all to authenticated
  using (public.is_trip_organiser(public.plan_trip(plan_id)) and public.plan_status(plan_id) = 'draft')
  with check (public.is_trip_organiser(public.plan_trip(plan_id)) and public.plan_status(plan_id) = 'draft');

create policy votes_select on public.votes for select to authenticated
  using (public.is_trip_member(public.plan_trip(plan_id)));
create policy votes_insert on public.votes for insert to authenticated
  with check (user_id = (select auth.uid())
              and public.is_trip_member(public.plan_trip(plan_id))
              and public.plan_status(plan_id) = 'voting');

create policy cand_select on public.trip_candidates for select to authenticated
  using (public.is_trip_member(trip_id));
create policy cand_insert on public.trip_candidates for insert to authenticated
  with check (added_by = (select auth.uid()) and public.is_trip_member(trip_id));
create policy cand_update on public.trip_candidates for update to authenticated
  using (public.is_trip_organiser(trip_id) or added_by = (select auth.uid()))
  with check (public.is_trip_organiser(trip_id) or added_by = (select auth.uid()));
create policy cand_delete on public.trip_candidates for delete to authenticated
  using ((public.is_trip_organiser(trip_id) or added_by = (select auth.uid()))
         and not exists (select 1 from public.trips t where t.id = trip_id and t.status = 'voting'));

create policy exp_select on public.expenses for select to authenticated
  using (public.is_trip_member(trip_id));
create policy exp_insert on public.expenses for insert to authenticated
  with check (created_by = (select auth.uid()) and public.is_trip_member(trip_id));
create policy exp_update on public.expenses for update to authenticated
  using ((created_by = (select auth.uid()) or public.is_trip_organiser(trip_id))
         and not exists (select 1 from public.settlements s where s.trip_id = expenses.trip_id and s.status = 'paid'))
  with check (public.is_trip_member(trip_id));
create policy exp_delete on public.expenses for delete to authenticated
  using ((created_by = (select auth.uid()) or public.is_trip_organiser(trip_id))
         and not exists (select 1 from public.settlements s where s.trip_id = expenses.trip_id and s.status = 'paid'));

create policy splits_select on public.expense_splits for select to authenticated
  using (exists (select 1 from public.expenses e where e.id = expense_id and public.is_trip_member(e.trip_id)));

create policy settle_select on public.settlements for select to authenticated
  using (public.is_trip_member(trip_id));
create policy settle_insert on public.settlements for insert to authenticated
  with check (created_by = (select auth.uid()) and public.is_trip_member(trip_id)
              and ((select auth.uid()) in (from_user, to_user)));
create policy settle_undo on public.settlements for update to authenticated
  using ((select auth.uid()) in (from_user, to_user))
  with check ((select auth.uid()) in (from_user, to_user));

create policy rs_select on public.reminder_settings for select to authenticated
  using (public.is_trip_member(trip_id));
create policy rs_write on public.reminder_settings for all to authenticated
  using (public.is_trip_organiser(trip_id)) with check (public.is_trip_organiser(trip_id));
create policy rl_select on public.reminder_log for select to authenticated
  using (public.is_trip_organiser(trip_id));

create policy jobs_select on public.ai_jobs for select to authenticated
  using (public.is_trip_member(trip_id));

revoke all on all tables in schema public from anon;
revoke all on public.invitations from authenticated;
grant select (id, trip_id, invitee_name, status, email_status, expires_at, used_by, created_at)
  on public.invitations to authenticated;
revoke update, delete on public.votes from authenticated;
revoke delete on public.settlements from authenticated;

revoke execute on function public.is_trip_member(uuid), public.is_trip_organiser(uuid),
  public.shares_trip_with(uuid), public.crew_budget(uuid), public.trip_progress(uuid),
  public.plan_trip(uuid), public.plan_status(uuid) from public, anon;
grant execute on function public.is_trip_member(uuid), public.is_trip_organiser(uuid),
  public.shares_trip_with(uuid), public.crew_budget(uuid), public.trip_progress(uuid),
  public.plan_trip(uuid), public.plan_status(uuid) to authenticated;

revoke execute on function public.handle_new_user(), public.add_organiser_member()
  from public, anon, authenticated;