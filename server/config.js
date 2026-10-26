// Config load/save helpers.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CONFIG_PATH = path.join(__dirname, "config.json");

export function loadConfig() {
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  // Providers with no explicit planet get an automatic celestial name.
  cfg.providers = assignPlanets(cfg.providers || []);
  return cfg;
}

export function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf-8");
  return cfg;
}

// Redact API keys before sending config to the dashboard.
export function publicConfig(cfg) {
  return {
    ...cfg,
    providers: cfg.providers.map((p) => ({
      ...p,
      apiKey: "",
      hasKey: Boolean(p.apiKey && p.apiKey.trim()),
    })),
  };
}

// Auto-assigned celestial names, in order. Providers without an explicit
// planet get one automatically so users never have to choose.
const AUTO_PLANETS = [
  "Matahari", "Merkurius", "Venus", "Bumi", "Mars", "Jupiter", "Saturnus",
  "Uranus", "Neptunus", "Pluto", "Triton", "Titan", "Europa", "Ganymede",
  "Callisto", "Io",
];

export function assignPlanets(providers) {
  return providers.map((p, i) => ({
    ...p,
    planet: p.planet && p.planet.trim() ? p.planet : AUTO_PLANETS[i % AUTO_PLANETS.length],
  }));
}

// Merge an incoming dashboard payload into stored config without losing keys.
export function mergeConfig(cur, incoming) {
  const merged = { ...cur, ...incoming };
  if (incoming.providers) {
    merged.providers = incoming.providers.map((p) => {
      const existing = cur.providers.find((x) => x.id === p.id);
      // Empty apiKey from the dashboard means "keep the stored key".
      const apiKey =
        p.apiKey && p.apiKey.trim() ? p.apiKey.trim() : existing?.apiKey || "";
      return { ...existing, ...p, apiKey };
    });
  }
  return merged;
}
