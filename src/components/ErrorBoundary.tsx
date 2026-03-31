"use client";

import { useEffect } from "react";
import { signOut } from "next-auth/react";
import { useLanguage } from "@/components/LanguageProvider";

export function useNetworkErrorHandler() {
  const { t } = useLanguage();

  useEffect(() => {
    const originalFetch = window.fetch;

    window.fetch = async (...args) => {
      try {
        const response = await originalFetch(...args);

        // Session expired — redirect to login
        if (response.status === 401) {
          const url = typeof args[0] === "string" ? args[0] : (args[0] as Request).url;
          // Don't intercept auth endpoints themselves
          if (!url.includes("/api/auth/")) {
            signOut({ callbackUrl: "/login?error=SessionExpired" });
          }
        }

        return response;
      } catch (error) {
        // Network error — only for API calls
        const url = typeof args[0] === "string" ? args[0] : (args[0] as Request).url;
        if (url.startsWith("/api/")) {
          throw error;
        }
        throw error;
      }
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [t]);
}

export function NetworkErrorHandler() {
  useNetworkErrorHandler();
  return null;
}
