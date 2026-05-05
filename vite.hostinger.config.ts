import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  build: {
    outDir: "dist/hostinger",
    emptyOutDir: true,
    rollupOptions: {
      input: "index.hostinger.html",
    },
  },
  define: {
    "process.env.SUPABASE_URL": JSON.stringify(""),
    "process.env.SUPABASE_SERVICE_ROLE_KEY": JSON.stringify(""),
  },
  resolve: {
    alias: [
      {
        find: "@tanstack/react-start/server",
        replacement: fileURLToPath(
          new URL("./src/hostinger/react-start-server.stub.ts", import.meta.url),
        ),
      },
      {
        find: "@tanstack/react-start",
        replacement: fileURLToPath(new URL("./src/hostinger/react-start.stub.ts", import.meta.url)),
      },
    ],
    dedupe: ["react", "react-dom", "@tanstack/react-router"],
  },
});
