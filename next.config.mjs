import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /* Pin the workspace root. A stray package-lock.json + node_modules sit in
     the PARENT folder ("coding and shi"), so Turbopack was inferring that as
     the root — which produced the multiple-lockfiles warning on every build
     and made dev-mode resolution of newly added files unreliable. */
  turbopack: {
    root: dirname(fileURLToPath(import.meta.url)),
  },
};

export default nextConfig;
