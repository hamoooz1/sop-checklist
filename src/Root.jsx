import React from "react";
import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import { MantineProvider, AppShell, Center, Loader } from "@mantine/core";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";                   // your existing app (AppInner inside)
import MarketingApp from "./marketing/MarketingApp.jsx"; // new marketing router

export default function Root() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);

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

  // If logged in => show the app. If not => show marketing site router.
  return (
    <BrowserRouter>
      {session ? <App /> : <MarketingApp />}
    </BrowserRouter>
  );
}
