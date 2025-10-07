import React from "react";
import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import { MantineProvider, AppShell, Center, Loader } from "@mantine/core";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";                   // your existing app (AppInner inside)
import MarketingApp from "./marketing/MarketingApp.jsx"; // new marketing router
import OnboardingWizard from "./marketing/OnboardingWizard.jsx";

export default function Root() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session ?? null);
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess ?? null);
    });

    return () => {
      sub.subscription.unsubscribe();
      mounted = false;
    };
  }, []);

  // Load profile only when we have a session
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!session) { setProfile(null); return; }
      setProfileLoading(true);
      const { data, error } = await supabase
        .from("profile")
        .select("*")
        .eq("id", session.user.id)
        .maybeSingle();
      if (!alive) return;
      setProfile(error ? null : data);
      setProfileLoading(false);
    })();
    return () => { alive = false; };
  }, [session]);

  if (loading) {
    return (
      <MantineProvider>
        <AppShell padding="md">
          <AppShell.Main>
            <Center mih="60dvh"><Loader /></Center>
          </AppShell.Main>
        </AppShell>
      </MantineProvider>
    );
  }

  return (
    <BrowserRouter>
      {!session ? (
        <MarketingApp />
      ) : profileLoading ? (
        <MantineProvider>
          <AppShell padding="md">
            <AppShell.Main>
              <Center mih="60dvh"><Loader /></Center>
            </AppShell.Main>
          </AppShell>
        </MantineProvider>
      ) : !profile?.company_id ? (
        <MantineProvider>
          <OnboardingWizard
            onDone={async () => {
              const { data } = await supabase
                .from("profile")
                .select("*")
                .eq("id", session.user.id)
                .single();
              setProfile(data);
            }}
          />
        </MantineProvider>
      ) : (
        <App />
      )}
    </BrowserRouter>
  );
}
