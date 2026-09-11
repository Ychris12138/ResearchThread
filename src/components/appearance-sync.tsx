import { useEffect } from "react";
import { applyAppearance, useSettings } from "@/lib/settings";

export function AppearanceSync() {
  const settings = useSettings();

  useEffect(() => {
    const apply = () => applyAppearance(useSettings.getState());
    if (useSettings.persist.hasHydrated()) apply();
    const unsub = useSettings.persist.onFinishHydration(apply);
    return unsub;
  }, []);

  useEffect(() => {
    if (!useSettings.persist.hasHydrated()) return;
    applyAppearance(settings);
  }, [settings]);

  useEffect(() => {
    if (settings.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyAppearance(useSettings.getState());
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [settings.theme]);

  return null;
}
