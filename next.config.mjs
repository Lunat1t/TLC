/** @type {import('next').NextConfig} */
// This branch packages its Next.js client as static assets inside Android.
// Server middleware and rewrites are not available within the native WebView.
const nextConfig = {
  reactStrictMode: true,
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
