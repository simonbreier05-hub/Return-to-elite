/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prisma needs to stay external in server bundles
  serverExternalPackages: ["@prisma/client", "prisma"],
  async redirects() {
    // Der alte Planer ist entfernt: Zuteilen und Anpassen gibt es nur noch im Grundriss.
    return [{ source: "/supervisor/planning", destination: "/floor-plan", permanent: false }];
  },
};

module.exports = nextConfig;
