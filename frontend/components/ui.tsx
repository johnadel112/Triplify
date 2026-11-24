"use client";
import { useEffect, useId, useRef } from "react";
import Link from "next/link";

export function Button({
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`button ${className}`} {...props} />;
}
export function Checkbox({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const id = useId();
  return (
    <label className="check-field" htmlFor={id}>
      <input id={id} type="checkbox" {...props} />
      <span>{label}</span>
    </label>
  );
}
export function PageContainer({ children }: { children: React.ReactNode }) {
  return <div className="container page-space">{children}</div>;
}
export function Breadcrumbs({
  items,
}: {
  items: { label: string; href?: string }[];
}) {
  return (
    <nav aria-label="Breadcrumb" className="breadcrumbs">
      <ol>
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`}>
            {item.href ? (
              <Link href={item.href}>{item.label}</Link>
            ) : (
              <span aria-current="page">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
export function Toast({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss(): void;
}) {
  return message ? (
    <div className="toast" role="status">
      <span>{message}</span>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={onDismiss}
      >
        Dismiss
      </button>
    </div>
  ) : null;
}
export function Notice({
  children,
  error = false,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  return children ? (
    <p
      role={error ? "alert" : "status"}
      className={`form-notice ${error ? "error" : "success"}-notice`}
    >
      {children}
    </p>
  ) : null;
}
export function Select({
  label,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} {...props}>
        {children}
      </select>
    </div>
  );
}
export function Textarea({
  label,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} {...props} />
    </div>
  );
}
export function Badge({ children }: { children: React.ReactNode }) {
  return <span className="badge">{children}</span>;
}
export function Pagination({
  page,
  pageCount,
  onChange,
  disabled,
}: {
  page: number;
  pageCount: number;
  onChange(page: number): void;
  disabled?: boolean;
}) {
  return (
    <nav aria-label="Pagination" className="pagination">
      <button
        disabled={disabled || page <= 1}
        onClick={() => onChange(page - 1)}
      >
        Previous
      </button>
      <span>
        Page {page} of {Math.max(1, pageCount)}
      </span>
      <button
        disabled={disabled || page >= pageCount}
        onClick={() => onChange(page + 1)}
      >
        Next
      </button>
    </nav>
  );
}
export function Table({
  children,
  caption,
}: {
  children: React.ReactNode;
  caption: string;
}) {
  return (
    <div className="table-wrap" role="region" aria-label={caption} tabIndex={0}>
      <table>
        <caption>{caption}</caption>
        {children}
      </table>
    </div>
  );
}
export function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose(): void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="dialog-heading">
        <h2 id={id}>{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close dialog">
          Close
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function ConfirmDialog({
  title,
  children,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  title: string;
  children: React.ReactNode;
  busy: boolean;
  error?: string;
  onCancel(): void;
  onConfirm(): void;
}) {
  return (
    <Dialog
      title={title}
      onClose={() => {
        if (!busy) onCancel();
      }}
    >
      <div>{children}</div>
      <Notice error>{error}</Notice>
      <div className="actions">
        <button autoFocus disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        <button className="button" disabled={busy} onClick={onConfirm}>
          {busy ? "Working…" : "Confirm"}
        </button>
      </div>
    </Dialog>
  );
}
export function Skeleton() {
  return (
    <div role="status" className="skeleton">
      Loading records…
    </div>
  );
}
export function EmptyState({
  children = "No records match these filters.",
}: {
  children?: React.ReactNode;
}) {
  return <p className="empty-state">{children}</p>;
}
