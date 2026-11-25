import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// Сборка (и кэш Vercel) не замечает изменений PostCSS-плагинов и оставляет старый CSS.
const cssPipelineHash = ["./postcss.config.mjs", "./scripts/postcss-mono.cjs"]
  .reduce((hash, file) => hash.update(readFileSync(new URL(file, import.meta.url))), createHash("sha1"))
  .digest("hex");

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(process.env.BRICK_STUDIO_LAN_DEV === "1" ? { distDir: ".next-lan" } : {}),
  reactStrictMode: true,
  serverExternalPackages: ["@napi-rs/canvas", "pdfjs-dist"],
  webpack(config, { isServer }) {
    if (config.cache && typeof config.cache === "object") {
      config.cache = { ...config.cache, version: `${config.cache.version}|css-${cssPipelineHash}` };
    }
    if (!isServer) {
      config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false, crypto: false };
    }
    return config;
  },
  outputFileTracingIncludes: {
    "/api/instructions/*/preview": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
    "/api/admin/instructions/link": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
  async redirects() {
    return [
      { source: '/controller.html', has: [{ type: 'query', key: 'project', value: '(?<projectId>.+)' }], destination: '/editor?id=:projectId', permanent: false },
      { source: '/controller.html', destination: '/', permanent: false },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/index.html',
        destination: '/',
      },
      {
        source: '/login.html',
        destination: '/login',
      },
      {
        source: '/editor.html',
        destination: '/editor',
      },
    ];
  },
};

export default nextConfig;
