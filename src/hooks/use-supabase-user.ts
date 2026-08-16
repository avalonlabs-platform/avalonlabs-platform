"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface SupabaseUserInfo {
  id: string;
  email: string;
}

/** Current signed-in user's id/email, for attaching to Paddle checkout
 *  (customData + customer.email) so the webhook doesn't have to guess.
 *  `undefined` while loading, `null` once confirmed signed out. */
export function useSupabaseUser(): SupabaseUserInfo | null | undefined {
  const [user, setUser] = useState<SupabaseUserInfo | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      setUser(data.user?.email ? { id: data.user.id, email: data.user.email } : null);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user?.email ? { id: session.user.id, email: session.user.email } : null);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return user;
}
