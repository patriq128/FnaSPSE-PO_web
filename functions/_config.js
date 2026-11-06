/**
 * FnaSPSE site configuration.
 *
 * This file runs on the server only. Cloudflare bundles it into the Pages
 * Functions and never serves it as a static file, so download URLs and
 * checksums stay behind the password gate.
 *
 * Set the password and session secret as environment variables:
 *   GAME_PASSWORD
 *   SESSION_SECRET
 *
 * See README.md for deployment instructions.
 */

export const game = {
  name: "FnaSPSE",
  version: "1.0.0",
  // Shown on the download screen. Leave empty to hide the description.
  description: "",
};

/**
 * The platforms shown on the download screen.
 *
 * To publish a build:
 *   1. Set available to true.
 *   2. Set format, size, url and sha256.
 *   3. Make sure url is an absolute HTTPS URL.
 *
 * Unavailable platforms still appear, with "Unavailable" in place of the
 * download button.
 */
export const platforms = [
  {
    name: "Windows",
    available: true,
    format: "ZIP",
    size: "148,8 MB",
    url: "https://github.com/patriq128/FnaSPSE-PO/releases/download/Demo/Windows_FnaSPSE.zip",
    sha256: "ea875dba2152a5503c27306b9c9f3628996b6b64503fd5e85cf2c62c755d3337",
  },
  {
    name: "Linux",
    available: true,
    format: "ZIP",
    size: "142,0 MB",
    url: "https://github.com/patriq128/FnaSPSE-PO/releases/download/Demo/Linux_FnaSPSE.zip",
    sha256: "6a3d53adc6a1a3306272036eed736946e22a2c8bb46114363bc43294fd73e6f0",
  },
  {
    name: "macOS",
    available: false,
    format: "ZIP",
    size: "000 MB",
    url: "https://github.com/OWNER/REPO/releases/download/v1.0.0/FnaSPSE-1.0.0-macos.zip",
    sha256: "",
  },
];
