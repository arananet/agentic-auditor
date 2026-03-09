/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push("cheerio", "undici");
    }
    return config;
  },
};

export default nextConfig;
