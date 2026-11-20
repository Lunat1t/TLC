/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(process.env.BRICK_STUDIO_LAN_DEV === "1" ? { distDir: ".next-lan" } : {}),
  reactStrictMode: true,
  serverExternalPackages: ["@napi-rs/canvas", "pdfjs-dist"],
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
        source: '/avatar.html',
        destination: '/avatar',
      },
      {
        source: '/editor.html',
        destination: '/editor',
      },
    ];
  },
};

export default nextConfig;
