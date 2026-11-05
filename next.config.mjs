/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@napi-rs/canvas", "pdfjs-dist"],
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
