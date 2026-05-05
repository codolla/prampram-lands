# Supabase setup

This project is already built for Supabase Postgres. The migrations in `supabase/migrations` create real PostgreSQL tables, enums, foreign keys, indexes, triggers, RLS policies, PostGIS helpers, and storage buckets. This app does not use a KV backend for its application data.

Core tables include `profiles`, `user_roles`, `landowners`, `lands`, `land_coordinates`, `ownership_history`, `bills`, `payments`, `documents`, `app_settings`, `sms_logs`, `land_types`, `rent_packages`, `staff_zones`, `staff_zone_assignments`, `land_staff_assignments`, `payroll_staff`, `payroll_components`, `payroll_staff_components`, `payroll_runs`, and `payslips`.

The edge function lives in `supabase/functions/admin-users`, and the app reads these environment variables:

```bash
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

## Create a fresh hosted project

You need a Supabase access token, organization ID, database password, and region.

```bash
npx supabase login
npx supabase projects create pcls --org-id <org-id> --db-password <strong-password> --region <region>
npx supabase link --project-ref <new-project-ref> --password <strong-password>
npx supabase db push
npx supabase functions deploy admin-users
```

Then add the new project values to `.env.local`:

```bash
SUPABASE_URL=https://<new-project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<publishable-or-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
VITE_SUPABASE_URL=https://<new-project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-or-anon-key>
```

## First admin user

The initial migration auto-creates a profile when a user signs up. `admin@example.com` is assigned the `admin` role by default; every other signup starts as `staff`.

Create the first user from Supabase Auth or from the app once environment variables are connected. Use `admin@example.com` if you want the automatic admin role, or add a row to `public.user_roles` manually for another admin account.

## Seed demo data

After signing in as an admin, use the app's seed/reset action if exposed in the UI. The server seed function reloads land types, rent packages, owners, lands, bills, payments, staff zones, and assignments.

## Local checks

```bash
npm run lint
npm run build
```
