import { createContext, useContext } from "react";
import type { PlaybookContextValue } from "@/lib/playbookExperimentConfig";

export const PlaybookExperimentContext = createContext<PlaybookContextValue | null>(null);

export function usePlaybook(): PlaybookContextValue {
  const ctx = useContext(PlaybookExperimentContext);
  if (!ctx) throw new Error("usePlaybook must be used within PlaybookExperimentContext");
  return ctx;
}
