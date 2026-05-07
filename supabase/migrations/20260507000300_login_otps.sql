create table if not exists public.login_otps (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  phone text not null,
  salt text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz null,
  attempts int not null default 0
);

create index if not exists login_otps_phone_created_at_idx
  on public.login_otps (phone, created_at desc);

alter table public.login_otps enable row level security;

