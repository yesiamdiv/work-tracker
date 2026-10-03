import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * PGlite ships WASM and resolves its own filesystem at runtime. Bundling it
   * breaks that resolution ("path argument must be of type string… received an
   * instance of URL"), so it has to load as a real Node module.
   */
  serverExternalPackages: ["@electric-sql/pglite"],
  images: {
    // Drive thumbnail links, used once attachments land (step 4).
    remotePatterns: [{ protocol: "https", hostname: "*.googleusercontent.com" }],
  },
};

export default nextConfig;
