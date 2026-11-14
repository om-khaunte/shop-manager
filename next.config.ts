import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Lets a second dev server (e.g. against the Firebase emulators) run beside the main one.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Serve Firebase's sign-in helper pages from this site's own domain. Browsers
  // block the cross-site storage that redirect sign-in relies on when the helper
  // lives on <project>.firebaseapp.com, so sign-in "succeeds" but you stay signed
  // out. To use this, set NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN to this site's domain.
  async rewrites() {
    const project = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!project || project.startsWith("demo-")) return [];
    const host = `https://${project}.firebaseapp.com`;
    return [
      { source: "/__/auth/:path*", destination: `${host}/__/auth/:path*` },
      { source: "/__/firebase/:path*", destination: `${host}/__/firebase/:path*` },
    ];
  },
};

export default nextConfig;
