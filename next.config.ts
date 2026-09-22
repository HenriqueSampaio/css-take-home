import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The schedule is the home screen. A config redirect answers with a real 307 before any
  // rendering starts; a page-level redirect() here would first stream the layout's shell.
  async redirects() {
    return [{ source: "/", destination: "/schedule", permanent: false }];
  },
};

export default nextConfig;
