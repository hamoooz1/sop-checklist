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
  checklists: {
    timeBlocks: [
      { id: "open", name: "Open", start: "05:00", end: "10:00" },
      { id: "mid", name: "Mid-Shift", start: "11:00", end: "16:00" },
      { id: "close", name: "Close", start: "20:00", end: "23:59" },
    ],
    templates: [
      {
        id: "tpl_001",
        name: "Open — FOH",
        locationId: "loc_001",
        timeBlockId: "open",
        recurrence: [0,1,2,3,4,5,6], // 0=Sun..6=Sat
        tasks: [
          { id: "tt_1", title: "Sanitize host stand", category: "Cleaning", inputType: "checkbox", noteRequired: false, photoRequired: true, allowNA: true, priority: 2 },
          { id: "tt_2", title: "Temp log: walk-in cooler", category: "Food Safety", inputType: "number", min: 32, max: 40, noteRequired: true, photoRequired: false, allowNA: false, priority: 1 }
        ]
      }
    ],
    overrides: [
      // ad-hoc extra tasks for a specific date/location/timeBlock
      { id: "ovr_2025_09_21_1", date: "2025-09-21", locationId: "loc_001", timeBlockId: "open", tasks: [{ id:"adh_1", title:"Extra ice check", inputType:"checkbox", allowNA:true }] }
    ]
  }  
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
