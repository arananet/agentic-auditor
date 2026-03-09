/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    serverExternalPackages: ["cheerio"],
  },
};

export default nextConfig;
