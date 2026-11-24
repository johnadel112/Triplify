"use client";
import Link from "next/link";
import { useState } from "react";
import { z } from "zod";
import { adminApi } from "@/lib/admin";
import {
  registerSchema,
  validationErrors,
  type FieldErrors,
} from "@/lib/validation";
import { ApiError } from "@/lib/api";
import { FormField } from "@/components/form-field";
import { Notice, Select } from "@/components/ui";
const schema = registerSchema
  .omit({ consent: true })
  .extend({
    role: z.enum(["HOTEL_MODERATOR", "AIRLINE_MODERATOR"]),
    providerId: z.string().regex(/^[a-f\d]{24}$/i, "Enter a valid provider ID"),
  });
export default function ModeratorsPage() {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    setErrors({});
    setNotice("");
    const parsed = schema.safeParse(Object.fromEntries(new FormData(form)));
    if (!parsed.success) return setErrors(validationErrors(parsed.error));
    setBusy(true);
    try {
      const user = await adminApi.moderator(parsed.data);
      form.reset();
      setNotice(
        `${user.name} was created. A password change is required at first login.`,
      );
    } catch (cause) {
      setErrors({
        form:
          cause instanceof ApiError
            ? cause.message
            : "Unable to create moderator.",
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <span className="section-kicker">PARTNER ACCESS</span>
      <h1>Create a moderator</h1>
      <p>
        Each moderator can manage only their assigned provider. Share the
        temporary password securely.
      </p>
      <p>
        <Link className="text-link" href="/admin/accounts">
          Manage existing moderator accounts
        </Link>
      </p>
      <form className="settings-form narrow" onSubmit={submit} noValidate>
        <Notice>{notice}</Notice>
        <Notice error>{errors.form}</Notice>
        <FormField
          label="Full name"
          name="name"
          required
          maxLength={100}
          error={errors.name}
        />
        <FormField
          label="Email"
          name="email"
          type="email"
          required
          error={errors.email}
        />
        <Select label="Moderator role" name="role">
          <option value="AIRLINE_MODERATOR">Airline moderator</option>
          <option value="HOTEL_MODERATOR">Hotel moderator</option>
        </Select>
        <FormField
          label="Assigned provider ID"
          name="providerId"
          required
          error={errors.providerId}
          hint="Use the existing provider's 24-character identifier. The server verifies the provider and its type."
        />
        <FormField
          label="Temporary password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          error={errors.password}
          hint="8–72 printable ASCII characters, including a letter and number."
        />
        <button className="button" disabled={busy}>
          {busy ? "Creating…" : "Create moderator"}
        </button>
      </form>
    </>
  );
}
