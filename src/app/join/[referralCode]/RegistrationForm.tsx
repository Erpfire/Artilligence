"use client";

import { useRouter } from "next/navigation";
import { useState, useRef } from "react";

interface FieldError {
  field: string;
  message: string;
}

export default function RegistrationForm({
  referralCode,
}: {
  referralCode: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [showKyc, setShowKyc] = useState(false);

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    preferredLanguage: "en",
    aadharNumber: "",
    panNumber: "",
    bankAccountNumber: "",
    bankIfscCode: "",
    bankName: "",
  });

  const aadharFileRef = useRef<HTMLInputElement>(null);
  const panFileRef = useRef<HTMLInputElement>(null);
  const passportPhotoRef = useRef<HTMLInputElement>(null);

  function getError(field: string) {
    return errors.find((e) => e.field === field)?.message;
  }

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setErrors((prev) => prev.filter((err) => err.field !== e.target.name));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors([]);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("name", form.name);
      formData.append("email", form.email);
      formData.append("phone", form.phone);
      formData.append("password", form.password);
      formData.append("confirmPassword", form.confirmPassword);
      formData.append("preferredLanguage", form.preferredLanguage);
      formData.append("referralCode", referralCode);

      // Optional KYC fields
      if (form.aadharNumber) formData.append("aadharNumber", form.aadharNumber);
      if (form.panNumber) formData.append("panNumber", form.panNumber);
      if (form.bankAccountNumber) formData.append("bankAccountNumber", form.bankAccountNumber);
      if (form.bankIfscCode) formData.append("bankIfscCode", form.bankIfscCode);
      if (form.bankName) formData.append("bankName", form.bankName);

      // Optional file uploads
      const aadharFile = aadharFileRef.current?.files?.[0];
      if (aadharFile) formData.append("aadharFile", aadharFile);

      const panFile = panFileRef.current?.files?.[0];
      if (panFile) formData.append("panFile", panFile);

      const passportPhoto = passportPhotoRef.current?.files?.[0];
      if (passportPhoto) formData.append("passportPhoto", passportPhoto);

      const res = await fetch("/api/auth/register", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setErrors(data.errors || [{ field: "general", message: "Registration failed" }]);
        return;
      }

      router.push("/login?registered=true");
    } catch {
      setErrors([{ field: "general", message: "Something went wrong. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  const generalError = getError("general") || getError("referralCode");

  const inputClass =
    "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {generalError && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-error">
          {generalError}
        </div>
      )}

      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium text-gray-700">
          Full Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          value={form.name}
          onChange={handleChange}
          className={inputClass}
          placeholder="Your full name"
        />
        {getError("name") && (
          <p className="mt-1 text-xs text-error">{getError("name")}</p>
        )}
      </div>

      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          value={form.email}
          onChange={handleChange}
          className={inputClass}
          placeholder="you@example.com"
        />
        {getError("email") && (
          <p className="mt-1 text-xs text-error">{getError("email")}</p>
        )}
      </div>

      <div>
        <label htmlFor="phone" className="mb-1 block text-sm font-medium text-gray-700">
          Phone Number
        </label>
        <div className="flex">
          <span className="inline-flex items-center rounded-l-md border border-r-0 border-gray-300 bg-gray-50 px-3 text-sm text-gray-500">
            +91
          </span>
          <input
            id="phone"
            name="phone"
            type="tel"
            required
            value={form.phone}
            onChange={handleChange}
            className="w-full rounded-r-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
            placeholder="9876543210"
            maxLength={10}
          />
        </div>
        {getError("phone") && (
          <p className="mt-1 text-xs text-error">{getError("phone")}</p>
        )}
      </div>

      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          value={form.password}
          onChange={handleChange}
          className={inputClass}
          placeholder="Min 8 characters"
        />
        {getError("password") && (
          <p className="mt-1 text-xs text-error">{getError("password")}</p>
        )}
      </div>

      <div>
        <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-gray-700">
          Confirm Password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={handleChange}
          className={inputClass}
          placeholder="Re-enter your password"
        />
        {getError("confirmPassword") && (
          <p className="mt-1 text-xs text-error">{getError("confirmPassword")}</p>
        )}
      </div>

      <div>
        <label htmlFor="preferredLanguage" className="mb-1 block text-sm font-medium text-gray-700">
          Preferred Language
        </label>
        <select
          id="preferredLanguage"
          name="preferredLanguage"
          value={form.preferredLanguage}
          onChange={handleChange}
          className={inputClass}
        >
          <option value="en">English</option>
          <option value="hi">Hindi</option>
        </select>
      </div>

      {/* Optional KYC Section */}
      <div className="border-t border-gray-200 pt-4">
        <button
          type="button"
          onClick={() => setShowKyc(!showKyc)}
          className="flex w-full items-center justify-between text-sm font-medium text-gray-700"
        >
          <span>KYC & Bank Details <span className="font-normal text-gray-400">(Optional)</span></span>
          <svg
            className={`h-5 w-5 text-gray-400 transition-transform ${showKyc ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showKyc && (
          <div className="mt-4 space-y-4">
            {/* Aadhar */}
            <div>
              <label htmlFor="aadharNumber" className="mb-1 block text-sm font-medium text-gray-700">
                Aadhar Number
              </label>
              <input
                id="aadharNumber"
                name="aadharNumber"
                type="text"
                value={form.aadharNumber}
                onChange={handleChange}
                className={inputClass}
                placeholder="12 digit Aadhar number"
                maxLength={12}
              />
              {getError("aadharNumber") && (
                <p className="mt-1 text-xs text-error">{getError("aadharNumber")}</p>
              )}
            </div>

            <div>
              <label htmlFor="aadharFile" className="mb-1 block text-sm font-medium text-gray-700">
                Aadhar Card Photo/PDF
              </label>
              <input
                id="aadharFile"
                ref={aadharFileRef}
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                className="w-full text-sm text-gray-500 file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary hover:file:bg-primary/20"
              />
              {getError("aadharFile") && (
                <p className="mt-1 text-xs text-error">{getError("aadharFile")}</p>
              )}
            </div>

            {/* PAN */}
            <div>
              <label htmlFor="panNumber" className="mb-1 block text-sm font-medium text-gray-700">
                PAN Number
              </label>
              <input
                id="panNumber"
                name="panNumber"
                type="text"
                value={form.panNumber}
                onChange={handleChange}
                className={inputClass}
                placeholder="e.g. ABCDE1234F"
                maxLength={10}
              />
              {getError("panNumber") && (
                <p className="mt-1 text-xs text-error">{getError("panNumber")}</p>
              )}
            </div>

            <div>
              <label htmlFor="panFile" className="mb-1 block text-sm font-medium text-gray-700">
                PAN Card Photo/PDF
              </label>
              <input
                id="panFile"
                ref={panFileRef}
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                className="w-full text-sm text-gray-500 file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary hover:file:bg-primary/20"
              />
              {getError("panFile") && (
                <p className="mt-1 text-xs text-error">{getError("panFile")}</p>
              )}
            </div>

            {/* Passport Photo */}
            <div>
              <label htmlFor="passportPhoto" className="mb-1 block text-sm font-medium text-gray-700">
                Passport Size Photo
              </label>
              <input
                id="passportPhoto"
                ref={passportPhotoRef}
                type="file"
                accept="image/jpeg,image/png"
                className="w-full text-sm text-gray-500 file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary hover:file:bg-primary/20"
              />
              {getError("passportPhoto") && (
                <p className="mt-1 text-xs text-error">{getError("passportPhoto")}</p>
              )}
            </div>

            {/* Bank Details */}
            <div className="border-t border-gray-100 pt-4">
              <p className="mb-3 text-sm font-medium text-gray-700">Bank Details</p>

              <div className="space-y-4">
                <div>
                  <label htmlFor="bankAccountNumber" className="mb-1 block text-sm font-medium text-gray-700">
                    Account Number
                  </label>
                  <input
                    id="bankAccountNumber"
                    name="bankAccountNumber"
                    type="text"
                    value={form.bankAccountNumber}
                    onChange={handleChange}
                    className={inputClass}
                    placeholder="Bank account number"
                    maxLength={18}
                  />
                  {getError("bankAccountNumber") && (
                    <p className="mt-1 text-xs text-error">{getError("bankAccountNumber")}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="bankIfscCode" className="mb-1 block text-sm font-medium text-gray-700">
                    IFSC Code
                  </label>
                  <input
                    id="bankIfscCode"
                    name="bankIfscCode"
                    type="text"
                    value={form.bankIfscCode}
                    onChange={handleChange}
                    className={inputClass}
                    placeholder="e.g. SBIN0001234"
                    maxLength={11}
                  />
                  {getError("bankIfscCode") && (
                    <p className="mt-1 text-xs text-error">{getError("bankIfscCode")}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="bankName" className="mb-1 block text-sm font-medium text-gray-700">
                    Bank Name
                  </label>
                  <input
                    id="bankName"
                    name="bankName"
                    type="text"
                    value={form.bankName}
                    onChange={handleChange}
                    className={inputClass}
                    placeholder="e.g. State Bank of India"
                  />
                  {getError("bankName") && (
                    <p className="mt-1 text-xs text-error">{getError("bankName")}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:outline-none disabled:opacity-50"
      >
        {loading ? "Creating account..." : "Create Account"}
      </button>
    </form>
  );
}
