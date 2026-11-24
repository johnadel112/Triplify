"use client";
import { useState } from "react";
import { FormField } from "@/components/form-field";
import { useAuth } from "@/components/auth-provider";
import { ApiError } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import {
  profileSchema,
  validationErrors,
  type FieldErrors,
} from "@/lib/validation";
import { Notice, Select, Skeleton } from "@/components/ui";
import type { Page } from "@/lib/admin";
import type { User } from "@/lib/types";
function CurrencySelect({ current }: { current: string }) {
  const [page, setPage] = useState(1);
  const resource = useResource<Page<{ code: string; name: string }>>(
    `/reference/currencies?page=${page}`,
  );
  const [selected, setSelected] = useState(current);
  return (
    <div>
      <Select
        label="Preferred currency"
        name="preferredCurrency"
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
      >
        <option value={selected}>{selected}</option>
        {resource.data?.items
          .filter((item) => item.code !== selected)
          .map((item) => (
            <option key={item.code} value={item.code}>
              {item.code} — {item.name}
            </option>
          ))}
      </Select>
      <Notice error>{resource.error}</Notice>
      {resource.error && (
        <button type="button" onClick={resource.reload}>
          Retry currencies
        </button>
      )}
      {resource.loading && <small role="status">Loading currencies…</small>}
      {resource.data && resource.data.pageCount > 1 && (
        <div className="actions">
          <button
            type="button"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            Previous currencies
          </button>
          <button
            type="button"
            disabled={page >= resource.data.pageCount}
            onClick={() => setPage(page + 1)}
          >
            More currencies
          </button>
        </div>
      )}
    </div>
  );
}
function ProfileForm({ profile }: { profile: User }) {
  const { updateProfile, user } = useAuth();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setErrors({});
    setNotice("");
    const parsed = profileSchema.safeParse(
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    if (!parsed.success) return setErrors(validationErrors(parsed.error));
    setBusy(true);
    try {
      await updateProfile({
        ...parsed.data,
        phoneNumber: parsed.data.phoneNumber || undefined,
      });
      setNotice("Profile saved.");
    } catch (cause) {
      setErrors({
        form:
          cause instanceof ApiError ? cause.message : "Unable to save profile.",
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <form key={revision} className="settings-form" onSubmit={submit} noValidate>
      <Notice>{notice}</Notice>
      <Notice error>{errors.form}</Notice>
      <FormField
        label="Full name"
        name="name"
        defaultValue={user?.name ?? profile.name}
        autoComplete="name"
        error={errors.name}
        required
      />
      <FormField
        label="Email"
        value={profile.email}
        readOnly
        disabled
        hint="Email changes are not currently supported."
      />
      <FormField
        label="Phone number"
        name="phoneNumber"
        defaultValue={user?.phoneNumber ?? profile.phoneNumber ?? ""}
        autoComplete="tel"
        error={errors.phoneNumber}
        hint="Leave blank to keep the existing phone number."
      />
      <CurrencySelect
        current={user?.preferredCurrency ?? profile.preferredCurrency}
      />
      <Notice error>{errors.preferredCurrency}</Notice>
      <div className="actions">
        <button className="button" disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setRevision(revision + 1);
            setErrors({});
            setNotice("");
          }}
        >
          Cancel changes
        </button>
      </div>
    </form>
  );
}
export default function ProfilePage() {
  const resource = useResource<User>("/users/me");
  return (
    <>
      <div className="content-heading">
        <span className="section-kicker">PROFILE</span>
        <h2>Your traveler details</h2>
        <p>Keep your personal information up to date.</p>
      </div>
      {resource.loading && <Skeleton />}
      <Notice error>{resource.error}</Notice>
      {resource.error && <button onClick={resource.reload}>Try again</button>}
      {resource.data && <ProfileForm profile={resource.data} />}
    </>
  );
}
