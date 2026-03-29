"use client";

import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import type { Locale } from "@/lib/i18n";

interface Profile {
  name: string;
  email: string;
  phone: string;
  preferredLanguage: Locale;
  hasCompletedOnboarding: boolean;
  referralCode: string;
}

export default function ProfileForm() {
  const { t, locale, setLocale } = useLanguage();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Profile fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [language, setLanguage] = useState<Locale>("en");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState("");
  const [profileError, setProfileError] = useState("");

  // Password fields
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState("");
  const [pwError, setPwError] = useState("");

  const loadProfile = useCallback(async (signal?: AbortSignal) => {
    const res = await fetch("/api/dashboard/profile", {
      cache: "no-store",
      signal,
    });
    const data = await res.json();
    setProfile(data);
    setName(data.name);
    setPhone(data.phone);
    setLanguage(data.preferredLanguage);
    setLoading(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    loadProfile(controller.signal).catch(() => {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    });

    return () => controller.abort();
  }, [loadProfile]);

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMsg("");
    setProfileError("");

    try {
      const res = await fetch("/api/dashboard/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, preferredLanguage: language }),
      });
      if (res.ok) {
        const updated = await res.json();
        setProfile(updated);
        setName(updated.name);
        setPhone(updated.phone);
        setLanguage(updated.preferredLanguage);
        setProfileMsg(t("profile.saved"));
        // Update language context if changed
        if (language !== locale) {
          setLocale(language);
        }
        setTimeout(() => setProfileMsg(""), 3000);
      } else {
        const err = await res.json();
        setProfileError(err.error || t("error.generic"));
      }
    } finally {
      setProfileSaving(false);
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg("");
    setPwError("");

    if (newPassword.length < 8) {
      setPwError(t("error.passwordShort"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError(t("error.passwordMismatch"));
      return;
    }

    setPwSaving(true);
    try {
      const res = await fetch("/api/dashboard/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (res.ok) {
        setPwMsg(t("profile.passwordChanged"));
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setTimeout(() => setPwMsg(""), 3000);
      } else {
        const err = await res.json();
        setPwError(err.error || t("error.generic"));
      }
    } finally {
      setPwSaving(false);
    }
  }

  function handleReplayOnboarding() {
    window.location.href = "/dashboard?replay_onboarding=1";
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-500">{t("common.loading")}</div>
      </div>
    );
  }

  return (
    <div data-testid="profile-page">
      <h1 className="text-2xl font-bold text-gray-900">{t("profile.title")}</h1>

      {/* Profile edit form */}
      <form onSubmit={handleProfileSave} className="mt-6 max-w-lg rounded-lg bg-white p-6 shadow-sm border">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">{t("profile.name")}</label>
            <input
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
              data-testid="profile-name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">{t("profile.email")}</label>
            <input
              readOnly
              value={profile?.email || ""}
              className="mt-1 w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
              data-testid="profile-email"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">{t("profile.phone")}</label>
            <input
              name="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
              data-testid="profile-phone"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">{t("profile.language")}</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as Locale)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
              data-testid="profile-language"
            >
              <option value="en">English</option>
              <option value="hi">हिन्दी</option>
            </select>
          </div>
        </div>

        {profileError && (
          <p className="mt-3 text-sm text-red-600" data-testid="profile-error">{profileError}</p>
        )}
        {profileMsg && (
          <p className="mt-3 text-sm text-green-600" data-testid="profile-success">{profileMsg}</p>
        )}

        <button
          type="submit"
          disabled={profileSaving}
          className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
          data-testid="profile-save"
        >
          {profileSaving ? t("common.loading") : t("profile.save")}
        </button>
      </form>

      {/* Change password */}
      <form onSubmit={handlePasswordChange} className="mt-6 max-w-lg rounded-lg bg-white p-6 shadow-sm border">
        <h2 className="text-lg font-semibold text-gray-900">{t("profile.changePassword")}</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">{t("profile.currentPassword")}</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
              data-testid="current-password"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">{t("profile.newPassword")}</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
              data-testid="new-password"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">{t("profile.confirmPassword")}</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
              data-testid="confirm-password"
            />
          </div>
        </div>

        {pwError && (
          <p className="mt-3 text-sm text-red-600" data-testid="password-error">{pwError}</p>
        )}
        {pwMsg && (
          <p className="mt-3 text-sm text-green-600" data-testid="password-success">{pwMsg}</p>
        )}

        <button
          type="submit"
          disabled={pwSaving}
          className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
          data-testid="change-password-submit"
        >
          {pwSaving ? t("common.loading") : t("profile.changePassword")}
        </button>
      </form>

      {/* Replay onboarding */}
      <div className="mt-6 max-w-lg">
        <button
          onClick={handleReplayOnboarding}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          data-testid="replay-onboarding"
        >
          {t("profile.replayOnboarding")}
        </button>
      </div>
    </div>
  );
}
