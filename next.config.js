/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prisma needs to stay external in server bundles
  serverExternalPackages: ["@prisma/client", "prisma"],
};

module.exports = nextConfig;
