import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const clientDir = join(root, "dist", "client");
const outputDir = join(root, "dist", "hostinger");
const directBuild = process.argv.includes("--direct");

if (!directBuild && !existsSync(clientDir)) {
  throw new Error("dist/client does not exist. Run npm run build first.");
}

if (!directBuild) {
  rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(outputDir, { recursive: true });
}

function copyRecursive(from, to) {
  const stat = statSync(from);
  if (stat.isDirectory()) {
    mkdirSync(to, { recursive: true });
    for (const entry of readdirSync(from)) {
      copyRecursive(join(from, entry), join(to, entry));
    }
    return;
  }
  copyFileSync(from, to);
}

if (!directBuild) {
  copyRecursive(clientDir, outputDir);
}

const shellPath = join(outputDir, "_shell", "index.html");
const indexPath = join(outputDir, "index.html");
const hostingerIndexPath = join(outputDir, "index.hostinger.html");

if (existsSync(shellPath) && !existsSync(indexPath)) {
  copyFileSync(shellPath, indexPath);
}

if (existsSync(hostingerIndexPath) && !existsSync(indexPath)) {
  copyFileSync(hostingerIndexPath, indexPath);
}

if (!existsSync(indexPath)) {
  const assetsDir = join(outputDir, "assets");
  const assetFiles = readdirSync(assetsDir);
  const entryScript = assetFiles.find((file) => {
    if (!file.endsWith(".js")) {
      return false;
    }

    const contents = readFileSync(join(assetsDir, file), "utf8");
    return contents.includes("hydrateRoot(document");
  });

  if (!entryScript) {
    throw new Error("Could not find the browser entry script in dist/client/assets.");
  }

  const stylesheetLinks = assetFiles
    .filter((file) => file.endsWith(".css"))
    .sort()
    .map((file) => `    <link rel="stylesheet" href="/assets/${file}">`);

  writeFileSync(
    indexPath,
    [
      "<!doctype html>",
      '<html lang="en">',
      "  <head>",
      '    <meta charset="utf-8">',
      '    <meta name="viewport" content="width=device-width, initial-scale=1">',
      "    <title>Customary Lands Secretariat - Prampram</title>",
      '    <meta name="description" content="Digital land records, ground rent billing and payments for the Prampram Customary Lands Secretariat.">',
      '    <link rel="icon" type="image/png" href="/logo.png">',
      '    <link rel="apple-touch-icon" href="/logo.png">',
      ...stylesheetLinks,
      "  </head>",
      "  <body>",
      `    <script type="module" src="/assets/${entryScript}"></script>`,
      "  </body>",
      "</html>",
      "",
    ].join("\n"),
  );
}

writeFileSync(
  join(outputDir, ".htaccess"),
  [
    "Options -MultiViews",
    "<IfModule mod_headers.c>",
    '  <FilesMatch "\\.html$">',
    '    Header set Cache-Control "no-cache, no-store, must-revalidate"',
    '    Header set Pragma "no-cache"',
    '    Header set Expires "0"',
    "  </FilesMatch>",
    '  <FilesMatch "\\.(js|css|png|jpg|jpeg|gif|svg|webp|ico|woff|woff2)$">',
    '    Header set Cache-Control "public, max-age=31536000, immutable"',
    "  </FilesMatch>",
    "</IfModule>",
    "RewriteEngine On",
    "RewriteBase /",
    "RewriteCond %{REQUEST_FILENAME} -f [OR]",
    "RewriteCond %{REQUEST_FILENAME} -d",
    "RewriteRule ^ - [L]",
    "RewriteRule ^assets/ - [L]",
    "RewriteRule ^ index.html [L]",
    "",
  ].join("\n"),
);

console.log("Hostinger static files prepared in dist/hostinger");
