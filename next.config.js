/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  // Lets a second server run alongside without sharing (and corrupting) the default .next folder.
  distDir: process.env.NEXT_DIST_DIR || '.next',
};
