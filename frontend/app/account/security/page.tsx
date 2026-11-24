"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormField } from "@/components/form-field";
import { useAuth } from "@/components/auth-provider";
import { ApiError } from "@/lib/api";
import {
  passwordSchema,
  validationErrors,
  type FieldErrors,
} from "@/lib/validation";

export default function SecurityPage() {
  const { changePassword, user } = useAuth();
  const router = useRouter();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  if (!user) return null;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    if (submitting) return;
    const parsed = passwordSchema.safeParse(
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    if (!parsed.success) return setErrors(validationErrors(parsed.error));
    setSubmitting(true);
    try {
      await changePassword({
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
      });
      router.replace("/login?passwordChanged=1");
    } catch (error) {
      setErrors({
        ...(error instanceof ApiError ? error.fields : {}),
        form:
          error instanceof ApiError
            ? error.message
            : "Unable to change your password.",
      });
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <>
      <div className="content-heading">
        <span className="section-kicker">SECURITY</span>
        <h2>Change your password</h2>
        <p>
          Changing it securely ends every active session, including this one.
        </p>
      </div>
      {user.mustChangePassword && (
        <p className="form-notice warning-notice">
          An administrator requires you to choose a new password before
          continuing.
        </p>
      )}
      <form className="settings-form" onSubmit={submit} noValidate>
        {errors.form && (
          <p role="alert" className="form-notice error-notice">
            {errors.form}
          </p>
        )}
        <FormField
          label="Current password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          error={errors.currentPassword}
          required
        />
        <FormField
          label="New password"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          hint="8–72 characters with a letter and number."
          error={errors.newPassword}
          required
        />
        <FormField
          label="Confirm new password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword}
          required
        />
        <button className="button" type="submit" disabled={submitting}>
          {submitting ? "Updating…" : "Update password"}{" "}
        </button>
      </form>
    </>
  );
}
