-- =============================================================================
-- Migration: 002_leads.sql
-- Description: Create leads table with RLS for law firm landing page
-- Law Office: עורך דין אביב יאסו
-- =============================================================================

-- Enable UUID extension (idempotent)
create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- ENUM: practice areas matching Hebrew landing page sections
-- ---------------------------------------------------------------------------
do $$ begin
  create type practice_area_enum as enum (
    'נדלן',
    'דיני_עבודה',
    'דיני_משפחה',
    'חוזים',
    'ליטיגציה',
    'אחר'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type preferred_contact_enum as enum (
    'phone',
    'email',
    'whatsapp'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type lead_status_enum as enum (
    'new',
    'contacted',
    'consultation_scheduled',
    'converted',
    'closed'
  );
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- TABLE: leads
-- ---------------------------------------------------------------------------
create table if not exists public.leads (
  id                  uuid          primary key default uuid_generate_v4(),

  -- Contact info
  full_name           text          not null check (char_length(full_name) between 2 and 120),
  phone               text          not null check (char_length(phone) between 9 and 20),
  email               text          check (email ~* '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$'),

  -- Enquiry details
  subject             text          not null check (char_length(subject) between 2 and 200),
  message             text          not null check (char_length(message) between 10 and 3000),
  practice_area       practice_area_enum,
  preferred_contact   preferred_contact_enum not null default 'phone',

  -- Legal / compliance
  consent_given_at    timestamptz   not null,

  -- Attribution & fraud signals
  source_url          text,
  ip_hash             text,          -- partial SHA-256 hash for fraud detection only

  -- CRM workflow
  status              lead_status_enum not null default 'new',
  internal_notes      text,
  assigned_to         text,

  -- Timestamps
  created_at          timestamptz   not null default now(),
  updated_at          timestamptz   not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists leads_status_idx       on public.leads (status);
create index if not exists leads_created_at_idx   on public.leads (created_at desc);
create index if not exists leads_practice_area_idx on public.leads (practice_area);

-- ---------------------------------------------------------------------------
-- Auto-update updated_at
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
  before update on public.leads
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.leads enable row level security;

-- Anonymous users (from the public form) may INSERT only
-- No SELECT, UPDATE, or DELETE is permitted for anon
create policy "anon_insert_leads"
  on public.leads
  for insert
  to anon
  with check (
    -- Consent must be present and recent (within last 10 minutes, server-side check)
    consent_given_at is not null
    and consent_given_at >= (now() - interval '10 minutes')
  );

-- Authenticated users (law office staff / admin dashboard) have full access
create policy "authenticated_full_access"
  on public.leads
  for all
  to authenticated
  using (true)
  with check (true);

-- Service role bypasses RLS automatically (no policy needed)

-- ---------------------------------------------------------------------------
-- Comments (documentation)
-- ---------------------------------------------------------------------------
comment on table  public.leads                  is 'Contact form submissions from the law office landing page (עו"ד אביב יאסו)';
comment on column public.leads.ip_hash          is 'Partial SHA-256 hash of submitter IP — for fraud detection, not PII storage';
comment on column public.leads.consent_given_at is 'Timestamp when privacy policy consent was confirmed — required for GDPR/Israeli privacy law';
comment on column public.leads.status           is 'CRM workflow stage for internal lead management';
