/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
