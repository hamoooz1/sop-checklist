// settings-store.js
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const LS_KEY = "sop_admin_settings_v1";

const defaultSettings = {
  company: {
    name: "FreshFork Hospitality",
    brandColor: "#0ea5e9",
    timezone: "America/Los_Angeles",
    weekStart: "Mon",
    locale: "en-US",
    logo: null,
  },
  locations: [{ id: "loc_001", name: "Main St Diner", timezone: "America/Los_Angeles", managers: [] }],
  users: [],
  policies: { photoRetentionDays: 90, requirePhotoForCategories: [], requireNoteForFoodSafety: true },
  notifications: { dailyDigest: true, reworkAlerts: true, overdueAlerts: true },
  security: { pinLength: 4, pinExpiryDays: 180, lockoutThreshold: 5, dualSignoff: false },
  theme: { defaultScheme: "auto", accent: "#0ea5e9" },
};

const SettingsCtx = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : defaultSettings;
    } catch {
      return defaultSettings;
    }
  });

  // Persist to localStorage (swap with API calls later)
  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(settings));
  }, [settings]);

  const updateSettings = (patch) =>
    setSettings((prev) => (typeof patch === "function" ? patch(prev) : patch));

  const value = useMemo(() => ({ settings, updateSettings, defaultSettings }), [settings]);

  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>
}

export function useSettings() {
  const ctx = useContext(SettingsCtx);
  if (!ctx) throw new Error("useSettings must be used inside <SettingsProvider>");
  return ctx;
}
