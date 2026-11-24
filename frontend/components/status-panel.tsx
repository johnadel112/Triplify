interface StatusPanelProps {
  tone?: "loading" | "error" | "empty" | "success";
  title: string;
  message: string;
  action?: React.ReactNode;
}

export function StatusPanel({
  tone = "empty",
  title,
  message,
  action,
}: StatusPanelProps) {
  return (
    <section
      className={`status-panel status-${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <span className="status-mark" aria-hidden="true">
        {tone === "loading"
          ? "···"
          : tone === "error"
            ? "!"
            : tone === "success"
              ? "✓"
              : "○"}
      </span>
      <div>
        <h2>{title}</h2>
        <p>{message}</p>
        {action}
      </div>
    </section>
  );
}
