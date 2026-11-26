"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { hotelApi } from "@/lib/moderators";
import { ApiError } from "@/lib/api";
import { FormField } from "@/components/form-field";
import { Notice, Select, Skeleton, Textarea } from "@/components/ui";

const COMMON_AMENITIES = [
  "Free Wi-Fi",
  "Swimming Pool",
  "Fitness Center",
  "Spa & Wellness",
  "Airport Shuttle",
  "Restaurant",
  "Bar / Lounge",
  "Free Parking",
  "Room Service",
  "Air Conditioning",
  "24-Hour Front Desk",
  "Pet Friendly",
];

export default function HotelProfilePage() {
  const { user } = useAuth();
  const providerId = user?.providerId;

  const [loading, setLoading] = useState(Boolean(providerId));
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Form states
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [address, setAddress] = useState("");
  const [starClass, setStarClass] = useState<number>(4);
  const [timeZone, setTimeZone] = useState("Africa/Cairo");
  const [amenities, setAmenities] = useState<string[]>([]);
  const [customAmenity, setCustomAmenity] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Photos state
  const [photos, setPhotos] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [photoSuccess, setPhotoSuccess] = useState("");
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);

  useEffect(() => {
    if (!providerId) return;
    let active = true;

    hotelApi
      .getHotel(providerId)
      .then((data) => {
        if (!active) return;
        setName(data.name || "");
        setDescription(data.description || "");
        setCity(data.city || "");
        setCountry(data.country || "");
        setAddress(data.address || "");
        setStarClass(data.starClass || 4);
        setTimeZone(data.timeZone || "Africa/Cairo");
        setAmenities(data.amenities || []);
        setPhotos(data.images || []);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError ? err.message : "Failed to load hotel profile.",
        );
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [providerId]);

  function toggleAmenity(item: string) {
    if (amenities.includes(item)) {
      setAmenities(amenities.filter((a) => a !== item));
    } else {
      setAmenities([...amenities, item]);
    }
  }

  function handleAddCustomAmenity() {
    const trimmed = customAmenity.trim();
    if (trimmed && !amenities.includes(trimmed)) {
      setAmenities([...amenities, trimmed]);
      setCustomAmenity("");
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!providerId || savingProfile) return;
    setSavingProfile(true);
    setError("");
    setSuccess("");

    try {
      await hotelApi.updateHotel(providerId, {
        name: name.trim(),
        description: description.trim(),
        city: city.trim(),
        country: country.trim(),
        address: address.trim(),
        starClass: Number(starClass),
        timeZone: timeZone.trim(),
        amenities,
      });
      setSuccess("Hotel details updated successfully.");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to update hotel profile.",
      );
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleUploadPhotos(e: React.FormEvent) {
    e.preventDefault();
    if (!providerId || !selectedFiles || selectedFiles.length === 0 || uploadingPhotos) return;

    if (photos.length + selectedFiles.length > 5) {
      setPhotoError("Hotels can have at most 5 photos in total. Please remove existing photos first.");
      return;
    }

    setUploadingPhotos(true);
    setPhotoError("");
    setPhotoSuccess("");

    try {
      const filesArray = Array.from(selectedFiles);
      const res = await hotelApi.uploadPhotos(providerId, filesArray);
      setPhotos(res.images || []);
      setPhotoSuccess(`${filesArray.length} photo(s) uploaded successfully.`);
      setSelectedFiles(null);
      const fileInput = document.getElementById("photo-files") as HTMLInputElement;
      if (fileInput) fileInput.value = "";
    } catch (err) {
      setPhotoError(
        err instanceof ApiError ? err.message : "Failed to upload photos.",
      );
    } finally {
      setUploadingPhotos(false);
    }
  }

  async function handleRemovePhoto(photoUrl: string) {
    if (!providerId || deletingPhotoId) return;

    // Extract image ID / filename from URL
    const segments = photoUrl.split("/");
    const imageId = segments[segments.length - 1];

    setDeletingPhotoId(photoUrl);
    setPhotoError("");
    setPhotoSuccess("");

    try {
      await hotelApi.removePhoto(providerId, imageId);
      setPhotos(photos.filter((p) => p !== photoUrl));
      setPhotoSuccess("Photo removed.");
    } catch (err) {
      setPhotoError(
        err instanceof ApiError ? err.message : "Failed to remove photo.",
      );
    } finally {
      setDeletingPhotoId(null);
    }
  }

  if (loading) return <Skeleton />;

  return (
    <>
      <span className="section-kicker">PROPERTY MANAGEMENT</span>
      <h1>Hotel Profile & Photos</h1>
      <p className="lede">
        Manage your public hotel presentation, star rating, amenities, and image gallery.
      </p>

      <div style={{ display: "grid", gap: "32px", maxWidth: "800px", marginTop: "24px" }}>
        {/* Photos Gallery & Upload */}
        <div style={{ padding: "24px", background: "white", borderRadius: "8px", border: "1px solid var(--line)" }}>
          <h2>Property Photos ({photos.length} / 5)</h2>
          <p style={{ margin: "0 0 16px", fontSize: "0.9rem", color: "var(--muted)" }}>
            High-quality JPG/PNG photos (max 5 MB each, up to 5 photos total).
          </p>

          <Notice>{photoSuccess}</Notice>
          <Notice error>{photoError}</Notice>

          {photos.length > 0 ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                gap: "16px",
                marginBottom: "20px",
              }}
            >
              {photos.map((url, idx) => (
                <div
                  key={idx}
                  style={{
                    border: "1px solid var(--line)",
                    borderRadius: "6px",
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Hotel photo ${idx + 1}`}
                    style={{ width: "100%", height: "130px", objectFit: "cover", display: "block" }}
                  />
                  <div style={{ padding: "8px", background: "white", textAlign: "center" }}>
                    <button
                      type="button"
                      className="button button-danger button-small"
                      disabled={deletingPhotoId === url}
                      onClick={() => handleRemovePhoto(url)}
                      style={{ width: "100%" }}
                    >
                      {deletingPhotoId === url ? "Removing…" : "Remove"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontStyle: "italic", color: "var(--muted)", marginBottom: "16px" }}>
              No photos uploaded yet. Upload property photos below.
            </p>
          )}

          {photos.length < 5 && (
            <form onSubmit={handleUploadPhotos} style={{ borderTop: "1px solid var(--line)", paddingTop: "16px" }}>
              <div className="field">
                <label htmlFor="photo-files">Choose Photos to Add (max {5 - photos.length} remaining)</label>
                <input
                  id="photo-files"
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/jpg"
                  onChange={(e) => setSelectedFiles(e.target.files)}
                />
              </div>
              <button
                className="button"
                type="submit"
                disabled={uploadingPhotos || !selectedFiles || selectedFiles.length === 0}
              >
                {uploadingPhotos ? "Uploading…" : "Upload selected photos"}
              </button>
            </form>
          )}
        </div>

        {/* Hotel Details Form */}
        <form className="settings-form" onSubmit={handleSaveProfile} style={{ margin: 0, maxWidth: "100%" }}>
          <h2>Hotel Information</h2>
          <Notice>{success}</Notice>
          <Notice error>{error}</Notice>

          <FormField
            label="Hotel Name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            maxLength={100}
            hint="Official property name"
          />

          <Textarea
            label="Description"
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            minLength={10}
            maxLength={3000}
            rows={4}
          />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <FormField
              label="City"
              name="city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              required
              minLength={2}
              maxLength={100}
            />

            <FormField
              label="Country"
              name="country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              required
              minLength={2}
              maxLength={100}
            />
          </div>

          <FormField
            label="Street Address"
            name="address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            required
            minLength={5}
            maxLength={200}
          />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <Select
              label="Star Classification"
              name="starClass"
              value={String(starClass)}
              onChange={(e) => setStarClass(Number(e.target.value))}
            >
              <option value="1">1 Star</option>
              <option value="2">2 Stars</option>
              <option value="3">3 Stars</option>
              <option value="4">4 Stars</option>
              <option value="5">5 Stars</option>
            </Select>

            <FormField
              label="Time Zone (IANA)"
              name="timeZone"
              value={timeZone}
              onChange={(e) => setTimeZone(e.target.value)}
              required
              hint="e.g. Africa/Cairo, Europe/London"
            />
          </div>

          <h3>Property Amenities</h3>
          <p style={{ margin: "0 0 12px", fontSize: "0.85rem", color: "var(--muted)" }}>
            Select standard amenities offered to guests:
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: "8px",
              marginBottom: "16px",
            }}
          >
            {COMMON_AMENITIES.map((amenity) => {
              const checked = amenities.includes(amenity);
              return (
                <label
                  key={amenity}
                  className="check-field"
                  style={{
                    padding: "8px 12px",
                    border: `1px solid ${checked ? "var(--champagne)" : "var(--line)"}`,
                    background: checked ? "#ffffff12" : "white",
                    borderRadius: "4px",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleAmenity(amenity)}
                  />
                  <span>{amenity}</span>
                </label>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: "8px", alignItems: "flex-end", marginBottom: "20px" }}>
            <div style={{ flex: 1 }}>
              <FormField
                label="Custom Amenity"
                name="customAmenity"
                value={customAmenity}
                onChange={(e) => setCustomAmenity(e.target.value)}
                placeholder="e.g. Helipad, Tennis Court"
              />
            </div>
            <button
              type="button"
              className="button button-small"
              onClick={handleAddCustomAmenity}
              style={{ marginBottom: "16px" }}
            >
              Add
            </button>
          </div>

          <div>
            <button className="button" type="submit" disabled={savingProfile || !providerId}>
              {savingProfile ? "Saving changes…" : "Save hotel profile"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
