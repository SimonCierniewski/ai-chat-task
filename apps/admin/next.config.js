/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@prototype/shared'],
  experimental: {
    serverActions: true,
  },
}

module.exports = nextConfig