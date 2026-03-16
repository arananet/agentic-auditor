/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    serverComponentsExternalPackages: ["playwright", "playwright-core"],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push("cheerio", "undici");
    }
    return config;
  },
};

export default nextConfig;
