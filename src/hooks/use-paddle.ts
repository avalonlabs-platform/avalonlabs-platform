"use client";

import { useEffect, useState } from "react";
import { initializePaddle, type Environments, type Paddle } from "@paddle/paddle-js";

/** Initializes Paddle.js once and returns the shared instance (or undefined until ready). */
export function usePaddle(): Paddle | undefined {
  const [paddle, setPaddle] = useState<Paddle | undefined>();

  useEffect(() => {
    if (paddle?.Initialized) return;

    const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
    const environment = process.env.NEXT_PUBLIC_PADDLE_ENV as Environments | undefined;
    if (!token || !environment) {
      console.warn(
        "Paddle client token/environment missing — set NEXT_PUBLIC_PADDLE_CLIENT_TOKEN and NEXT_PUBLIC_PADDLE_ENV."
      );
      return;
    }

    initializePaddle({ token, environment }).then((instance) => {
      if (instance) setPaddle(instance);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return paddle;
}
