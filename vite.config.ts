import "dotenv/config";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import path from "path";

export default defineConfig({
  plugins: [
    tanstackStart(),
    nitro(),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "./src"),
    },
  },
});