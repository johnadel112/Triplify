"use client";
import { useId, useState } from "react";
interface FormFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}
export function FormField({
  label,
  error,
  hint,
  id,
  type,
  ...props
}: FormFieldProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  const [visible, setVisible] = useState(false);
  return (
    <div className="field">
      <label className="field-label" htmlFor={fieldId}>
        {label}
      </label>
      <div className="input-wrap">
        <input
          id={fieldId}
          type={type === "password" && visible ? "text" : type}
          aria-invalid={Boolean(error)}
          aria-describedby={
            error || hint ? `${fieldId}-description` : undefined
          }
          {...props}
        />
        {type === "password" && (
          <button
            type="button"
            className="password-toggle"
            aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
            aria-pressed={visible}
            onClick={() => setVisible(!visible)}
          >
            {visible ? "Hide" : "Show"}
          </button>
        )}
      </div>
      {(error || hint) && (
        <span
          role={error ? "alert" : undefined}
          className={error ? "field-error" : "field-hint"}
          id={`${fieldId}-description`}
        >
          {error || hint}
        </span>
      )}
    </div>
  );
}
