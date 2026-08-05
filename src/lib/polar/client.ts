import { Polar } from "@polar-sh/sdk";
import { polarConfig } from "./config";

// Single construction point for the Polar admin API client. Every live Polar
// call in the app routes through this factory, which short-circuits before any
// SDK construction when billing is not configured — polarConfig.enabled is the
// one switch that turns the whole integration on/off (approval checklist).
export function createPolarAdmin(): Polar | null {
  if (!polarConfig.enabled) return null;
  return new Polar({ accessToken: polarConfig.accessToken });
}
