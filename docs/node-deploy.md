# Node.js Deployment

This app should run as a Node.js server, not as plain static files. The app uses
TanStack Start server rendering, server functions, and server routes.

## Build

```bash
npm ci
npm run build
```

## Start

```bash
npm start
```

The server reads `PORT` and `HOST`:

```bash
PORT=3000 HOST=0.0.0.0 npm start
```

## Required Environment Variables

Set these in the Node host environment:

```bash
SUPABASE_URL=...
SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

Do not expose `SUPABASE_SERVICE_ROLE_KEY` to the browser. It is only for the
Node server runtime.

## Hostinger Note

Hostinger shared static hosting cannot run this full app. Use a Hostinger plan
with Node.js app support, a VPS, or another Node host. Point the domain/proxy to
the Node process and make sure static files under `dist/client` are served by the
Node server.
