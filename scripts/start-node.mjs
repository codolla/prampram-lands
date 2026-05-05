import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
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

function resolveStaticPath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const normalized = normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = resolve(clientDir, `.${sep}${normalized}`);

  if (!filePath.startsWith(`${clientDir}${sep}`) && filePath !== clientDir) {
    return null;
  }

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    return null;
  }

  return filePath;
}

function serveStatic(req, res, filePath) {
  const ext = extname(filePath);
  const immutable = filePath.includes(`${sep}assets${sep}`);

  res.statusCode = 200;
  res.setHeader("Content-Type", mimeTypes.get(ext) || "application/octet-stream");
  res.setHeader(
    "Cache-Control",
    immutable ? "public, max-age=31536000, immutable" : "no-cache",
  );

  createReadStream(filePath).pipe(res);
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

createServer(async (req, res) => {
  try {
    const protocol = req.headers["x-forwarded-proto"] || "http";
    const hostHeader = req.headers.host || `localhost:${port}`;
    const url = new URL(req.url || "/", `${protocol}://${hostHeader}`);
    const staticPath = resolveStaticPath(url.pathname);

    if (staticPath) {
      serveStatic(req, res, staticPath);
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
}).listen(port, host, () => {
  console.log(`PCLS Node server listening on http://${host}:${port}`);
});
