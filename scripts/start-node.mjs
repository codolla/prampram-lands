import { createServer } from "node:http";
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { extname, relative, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import serverEntry from "../dist/server/server.js";

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
const clientDir = resolve(process.cwd(), "dist", "client");

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

function safeDecodePathname(pathname) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return null;
  }
}

function buildStaticFileMap(rootDir) {
  if (!existsSync(rootDir)) return new Map();

  const map = new Map();
  const stack = [rootDir];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    const entries = readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const absPath = resolve(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(absPath);
        continue;
      }
      if (!entry.isFile()) continue;

      const rel = relative(rootDir, absPath).split(sep).join("/");
      map.set(`/${rel}`, absPath);
    }
  }

  return map;
}

const staticFileMap = buildStaticFileMap(clientDir);

function serveStatic(res, filePath, pathname) {
  const ext = extname(filePath);
  const immutable = pathname.includes("/assets/");

  res.statusCode = 200;
  res.setHeader("Content-Type", mimeTypes.get(ext) || "application/octet-stream");
  res.setHeader("Cache-Control", immutable ? "public, max-age=31536000, immutable" : "no-cache");

  const stream = createReadStream(filePath);
  stream.on("error", () => {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
    }
    res.end("Internal Server Error");
  });
  stream.pipe(res);
}

async function readRequestBody(req) {
  if (req.method === "GET" || req.method === "HEAD") {
    return undefined;
  }

  return Readable.toWeb(req);
}

function writeHeaders(res, headers) {
  for (const [key, value] of headers) {
    if (key.toLowerCase() !== "set-cookie") {
      res.setHeader(key, value);
    }
  }

  const setCookies =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : headers.get("set-cookie")
        ? [headers.get("set-cookie")]
        : [];

  if (setCookies.length > 0) {
    res.setHeader("Set-Cookie", setCookies);
  }
}

const server = createServer(async (req, res) => {
  try {
    const protocol = req.headers["x-forwarded-proto"] || "http";
    const hostHeader = req.headers.host || `localhost:${port}`;
    const url = new URL(req.url || "/", `${protocol}://${hostHeader}`);
    const pathname = safeDecodePathname(url.pathname);

    if (!pathname) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Bad Request");
      return;
    }

    if (pathname === "/health" || pathname === "/healthz") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    const staticPath = staticFileMap.get(pathname);
    if (staticPath) {
      serveStatic(res, staticPath, pathname);
      return;
    }

    const request = new Request(url, {
      method: req.method,
      headers: req.headers,
      body: await readRequestBody(req),
      duplex: "half",
    });

    const response = await serverEntry.fetch(request);
    res.statusCode = response.status;
    res.statusMessage = response.statusText;
    writeHeaders(res, response.headers);

    if (!response.body) {
      res.end();
      return;
    }

    Readable.fromWeb(response.body).pipe(res);
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Internal Server Error");
  }
});

server.keepAliveTimeout = 65_000;
server.headersTimeout = 70_000;

function shutdown() {
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

server.listen(port, host, () => {
  console.log(`PCLS Node server listening on http://${host}:${port}`);
});
