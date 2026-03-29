"use client";

import { useEffect, useRef } from "react";
import { useLanguage } from "@/components/LanguageProvider";

interface OnboardingTourProps {
  onComplete: () => void;
}

export default function OnboardingTour({ onComplete }: OnboardingTourProps) {
  const { t } = useLanguage();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      const { driver } = await import("driver.js");
      await import("driver.js/dist/driver.css");

      const driverObj = driver({
        showProgress: true,
        animate: true,
        overlayColor: "rgba(0,0,0,0.5)",
        nextBtnText: t("onboarding.next"),
        prevBtnText: t("onboarding.prev"),
        doneBtnText: t("onboarding.done"),
        steps: [
          {
            element: '[data-testid="dashboard-home"]',
            popover: {
              title: t("onboarding.step1.title"),
              description: t("onboarding.step1.desc"),
            },
          },
          {
            element: '[data-testid="wallet-summary"]',
            popover: {
              title: t("onboarding.step2.title"),
              description: t("onboarding.step2.desc"),
            },
          },
          {
            element: '[data-testid="referral-link-section"]',
            popover: {
              title: t("onboarding.step3.title"),
              description: t("onboarding.step3.desc"),
            },
          },
          {
            element: '[data-testid="quick-submit-sale"]',
            popover: {
              title: t("onboarding.step4.title"),
              description: t("onboarding.step4.desc"),
            },
          },
          {
            element: '[data-testid="nav-users"]',
            popover: {
              title: t("onboarding.step5.title"),
              description: t("onboarding.step5.desc"),
            },
          },
        ],
        onDestroyStarted: () => {
          fetch("/api/dashboard/complete-onboarding", { method: "POST" });
          driverObj.destroy();
          onComplete();
        },
      });

      driverObj.drive();
    })();
  }, [t, onComplete]);

  return null;
}
