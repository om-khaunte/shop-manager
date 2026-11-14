import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Lets a second dev server (e.g. against the Firebase emulators) run beside the main one.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
