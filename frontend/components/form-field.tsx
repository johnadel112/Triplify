interface FormFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export function FormField({ label, error, hint, id, ...props }: FormFieldProps) {
  const fieldId = id ?? props.name;
  const descriptionId = error || hint ? `${fieldId}-description` : undefined;
  return (
    <label className="field" htmlFor={fieldId}>
      <span className="field-label">{label}</span>
      <input id={fieldId} aria-invalid={Boolean(error)} aria-describedby={descriptionId} {...props} />
      {(error || hint) && <span className={error ? 'field-error' : 'field-hint'} id={descriptionId}>{error || hint}</span>}
    </label>
  );
}
