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
  // Which user the loaded profile belongs to. Token refreshes must not reset this.
  const [profileUserId, setProfileUserId] = useState(null);
  const userId = session?.user?.id ?? null;

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

  // Reload the profile only when the signed-in user changes.
  // A tab switch refreshes the access token and would otherwise unmount the app.
  useEffect(() => {
    let alive = true;
    if (!userId) {
      setProfile(null);
      setProfileUserId(null);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("profile")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      if (!alive) return;
      setProfile(error ? null : data);
      setProfileUserId(userId);
    })();
    return () => { alive = false; };
  }, [userId]);

  const profileReady = !userId || profileUserId === userId;

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
        <MantineProvider>
          <MarketingApp />
        </MantineProvider>
      ) : !profileReady ? (
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
        <App session={session} profile={profile} />
      )}
    </BrowserRouter>
  );
}
