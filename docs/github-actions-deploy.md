# GitHub Actions Deployment

This repository includes `.github/workflows/deploy.yml`.

On every push to `main`, GitHub Actions will:

1. Install dependencies.
2. Build the app with `npm run build`.
3. Upload the build as a short-lived artifact.
4. Deploy over SSH only if the required SSH secrets are configured.

## Required GitHub Secrets

Add these in GitHub:

`Settings -> Secrets and variables -> Actions -> New repository secret`

Supabase/build secrets:

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

SSH deploy secrets:

```text
HOSTINGER_SSH_HOST
HOSTINGER_SSH_PORT
HOSTINGER_SSH_USER
HOSTINGER_SSH_KEY
HOSTINGER_APP_DIR
HOSTINGER_RESTART_COMMAND
```

`HOSTINGER_SSH_PORT` is optional if your server uses port `22`.

`HOSTINGER_RESTART_COMMAND` is optional. If it is not set, the workflow uses:

```bash
pm2 restart pcls || pm2 start server.js --name pcls
```

## Hostinger Node App Panel

If you are using Hostinger's managed GitHub deployment instead of SSH, you may
not need the SSH deploy job. In that case, let Hostinger watch the GitHub repo
and use these settings:

```text
Build command: npm ci && npm run build
Start command: npm start
Entry file: server.js
Node version: 22.x
```
