# Hostinger shared hosting deploy

This build is for Hostinger shared hosting, where you upload static files to `public_html`.

```bash
npm run build:hostinger
```

Upload the contents of `dist/hostinger` to `public_html`.

The generated `.htaccess` sends deep links such as `/dashboard` and `/lands` back to `index.html`, allowing the client router to load the correct page.

## Important limitations

Static shared hosting cannot run TanStack Start server functions. Most CRUD screens talk directly to Supabase from the browser and can work on shared hosting, but server-only actions need another backend runtime.

Affected actions include:

- admin user edge operations: handled by Supabase Edge Function `admin-users`
- seed/reset data
- payroll generation/finalization helpers
- boundary save/overlap helpers
- SMS/email server helpers

Keep Supabase migrations and Edge Functions deployed. Never upload `SUPABASE_SERVICE_ROLE_KEY` to Hostinger as a public browser variable.
