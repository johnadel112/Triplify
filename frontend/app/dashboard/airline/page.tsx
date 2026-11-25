"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { airlineApi, Airline } from "@/lib/moderators";
import { ApiError } from "@/lib/api";
import { FormField } from "@/components/form-field";
import { Notice, Skeleton } from "@/components/ui";

export default function AirlineProfilePage() {
  const { user } = useAuth();
  const providerId = user?.providerId;

  const [loading, setLoading] = useState(Boolean(providerId));
  const [airline, setAirline] = useState<Airline | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState("");
  const [logoSuccess, setLogoSuccess] = useState("");

  useEffect(() => {
    if (!providerId) return;
    let active = true;

    airlineApi
      .getProfile(providerId)
      .then((data) => {
        if (!active) return;
        setAirline(data);
        setName(data.name || "");
        setCode(data.code || "");
        setContactEmail(data.contactEmail || "");
        setLogoUrl(data.logoUrl || "");
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError ? err.message : "Failed to load airline profile.",
        );
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [providerId]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!providerId || savingProfile) return;
    setSavingProfile(true);
    setError("");
    setSuccess("");

    try {
      const updated = await airlineApi.updateProfile({
        name: name.trim() || undefined,
        code: code.trim().toUpperCase() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        logoUrl: logoUrl.trim() || undefined,
      });
      setAirline(updated);
      setSuccess("Airline profile updated successfully.");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to update profile.",
      );
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleUploadLogo(e: React.FormEvent) {
    e.preventDefault();
    if (!providerId || !logoFile || uploadingLogo) return;
    setUploadingLogo(true);
    setLogoError("");
    setLogoSuccess("");

    try {
      const res = await airlineApi.uploadLogo(providerId, logoFile);
      setLogoUrl(res.logoUrl);
      if (airline) {
        setAirline({ ...airline, logoUrl: res.logoUrl });
      }
      setLogoSuccess("Airline logo uploaded and updated successfully.");
      setLogoFile(null);
    } catch (err) {
      setLogoError(
        err instanceof ApiError ? err.message : "Failed to upload logo.",
      );
    } finally {
      setUploadingLogo(false);
    }
  }

  if (loading) return <Skeleton />;

  return (
    <>
      <span className="section-kicker">PROFILE MANAGEMENT</span>
      <h1>Airline Profile</h1>
      <p className="lede">
        Manage your public brand identity, IATA code, and customer contact details.
      </p>

      <div style={{ display: "grid", gap: "32px", maxWidth: "760px", marginTop: "24px" }}>
        {airline?.logoUrl && (
          <div style={{ padding: "16px", background: "white", borderRadius: "8px", border: "1px solid var(--line)" }}>
            <span className="section-kicker" style={{ display: "block", marginBottom: "8px" }}>Current Brand Logo</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={airline.logoUrl}
              alt={airline.name || "Airline logo"}
              style={{ maxHeight: "80px", maxWidth: "240px", objectFit: "contain" }}
            />
          </div>
        )}

        <form className="settings-form" onSubmit={handleSaveProfile}>
          <h2>Profile Details</h2>
          <Notice>{success}</Notice>
          <Notice error>{error}</Notice>

          <FormField
            label="Airline Name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={100}
            hint="Official commercial airline name"
          />

          <FormField
            label="Airline Code (IATA)"
            name="code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={2}
            pattern="[A-Za-z0-9]{2}"
            hint="Two uppercase letters or digits (e.g. MS, BA, DL)"
          />

          <FormField
            label="Contact Email"
            name="contactEmail"
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            hint="Operations or customer service email address"
          />

          <FormField
            label="Logo URL (Optional)"
            name="logoUrl"
            type="url"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            hint="Public HTTPS link to logo, or upload a file below"
          />

          <button className="button" type="submit" disabled={savingProfile || !providerId}>
            {savingProfile ? "Saving changes…" : "Save profile"}
          </button>
        </form>

        <form className="settings-form" onSubmit={handleUploadLogo}>
          <h2>Upload Brand Logo</h2>
          <p style={{ margin: "0 0 16px", fontSize: "0.9rem", color: "var(--muted)" }}>
            Upload a JPG or PNG image (max 5 MB). This replaces your existing logo across Triplify.
          </p>
          <Notice>{logoSuccess}</Notice>
          <Notice error>{logoError}</Notice>

          <div className="field">
            <label htmlFor="logo-file">Select Image File</label>
            <input
              id="logo-file"
              type="file"
              accept="image/png,image/jpeg,image/jpg"
              onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
            />
          </div>

          <button
            className="button"
            type="submit"
            disabled={uploadingLogo || !logoFile || !providerId}
          >
            {uploadingLogo ? "Uploading…" : "Upload logo"}
          </button>
        </form>
      </div>
    </>
  );
}
