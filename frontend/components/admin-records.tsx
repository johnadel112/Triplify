"use client";
import { useState } from "react";
import {
  adminApi,
  queryString,
  type Audit,
  type Booking,
  type Page,
  type Report,
} from "@/lib/admin";
import { useResource } from "@/lib/use-resource";
import { ApiError } from "@/lib/api";
import { FormField } from "./form-field";
import {
  Badge,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Notice,
  Pagination,
  Select,
  Skeleton,
  Table,
  Textarea,
} from "./ui";
export function BookingRecords() {
  const [filters, setFilters] = useState<Record<string, string | number>>({
    page: 1,
  });
  const resource = useResource<Page<Booking>>(
    `/admin/bookings?${queryString(filters)}`,
  );
  return (
    <>
      <h1>Booking inspection</h1>
      <p>Read-only oversight of flight and hotel bookings.</p>
      <form
        className="filters"
        onSubmit={(event) => {
          event.preventDefault();
          setFilters({
            ...(Object.fromEntries(new FormData(event.currentTarget)) as Record<
              string,
              string
            >),
            page: 1,
          });
        }}
      >
        <Select name="type" label="Booking type">
          <option value="">All types</option>
          <option>FLIGHT</option>
          <option>HOTEL</option>
        </Select>
        <Select name="status" label="Status">
          <option value="">All statuses</option>
          {["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"].map((status) => (
            <option key={status}>{status}</option>
          ))}
        </Select>
        <FormField label="Start date" name="startDate" type="date" />
        <FormField label="End date" name="endDate" type="date" />
        <button className="button">Apply filters</button>
      </form>
      <ResourceState resource={resource} />
      {resource.data && (
        <>
          <Table caption={`${resource.data.total} bookings`}>
            <thead>
              <tr>
                {[
                  "Reference",
                  "Customer",
                  "Provider",
                  "Dates",
                  "Amount",
                  "Status",
                ].map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resource.data.items.map((booking) => (
                <tr key={`${booking.type}-${booking.reference}`}>
                  <td>
                    {booking.reference}
                    <small>{booking.type}</small>
                  </td>
                  <td>
                    {booking.user.name}
                    <small>{booking.user.id}</small>
                  </td>
                  <td>{booking.provider.name}</td>
                  <td>
                    {date(booking.startDate)}
                    {booking.endDate && (
                      <small>to {date(booking.endDate)}</small>
                    )}
                  </td>
                  <td>
                    {booking.amount.value} {booking.amount.currency}
                  </td>
                  <td>
                    <Badge>{booking.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination
            page={Number(filters.page)}
            pageCount={resource.data.pageCount}
            onChange={(page) => setFilters({ ...filters, page })}
          />
        </>
      )}
    </>
  );
}
export function AuditRecords() {
  const [page, setPage] = useState(1);
  const resource = useResource<Page<Audit>>(
    `/admin/audit-logs?page=${page}&limit=10`,
  );
  return (
    <>
      <h1>Audit logs</h1>
      <p>
        The recorded history of administrative actions. Entries are read-only.
      </p>
      <ResourceState resource={resource} />
      {resource.data && (
        <>
          <Table caption={`${resource.data.total} audit entries`}>
            <thead>
              <tr>
                {["Timestamp", "Actor", "Action", "Target", "Outcome"].map(
                  (label) => (
                    <th key={label}>{label}</th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {resource.data.items.map((log) => (
                <tr key={log.id}>
                  <td>{date(log.occurredAt, true)}</td>
                  <td>{log.actorId}</td>
                  <td>
                    {log.action}
                    <small>
                      {[log.beforeStatus, log.afterStatus]
                        .filter(Boolean)
                        .join(" → ")}
                    </small>
                  </td>
                  <td>
                    {log.targetType}
                    <small>{log.targetId}</small>
                  </td>
                  <td>
                    <Badge>{log.outcome}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination
            page={page}
            pageCount={resource.data.pageCount}
            onChange={setPage}
          />
        </>
      )}
    </>
  );
}
export function ReportRecords() {
  const [filters, setFilters] = useState({
    page: 1,
    status: "OPEN",
    targetType: "",
  });
  const resource = useResource<Page<Report>>(
    `/admin/reports?${queryString(filters)}`,
  );
  const [detail, setDetail] = useState<Report>();
  const [pending, setPending] = useState<{
    report: Report;
    action: "DISMISS" | "HIDE" | "DELETE" | "CONTENT_DELETE";
  }>();
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function confirm() {
    if (!pending || busy) return;
    setBusy(true);
    setError("");
    try {
      if (pending.action === "CONTENT_DELETE")
        await adminApi.deleteContent(
          pending.report.targetType,
          pending.report.targetId,
        );
      else await adminApi.resolve(pending.report.id, pending.action, notes);
      setPending(undefined);
      setNotice("Moderation action completed.");
      resource.reload();
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "Unable to complete moderation.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>Content reports</h1>
      <p>
        Review reported content before deciding whether to dismiss, hide or
        delete it.
      </p>
      <form
        className="filters"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          setFilters({
            page: 1,
            status: String(data.get("status")),
            targetType: String(data.get("targetType")),
          });
        }}
      >
        <Select label="Report status" name="status" defaultValue="OPEN">
          <option value="">All statuses</option>
          {["OPEN", "DISMISSED", "RESOLVED_HIDDEN", "RESOLVED_DELETED"].map(
            (value) => (
              <option key={value}>{value}</option>
            ),
          )}
        </Select>
        <Select label="Content type" name="targetType">
          <option value="">All content</option>
          {["POST", "COMMENT", "REVIEW", "ITINERARY"].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </Select>
        <button className="button">Apply filters</button>
      </form>
      <Notice>{notice}</Notice>
      <ResourceState resource={resource} />
      {resource.data && (
        <>
          <Table caption={`${resource.data.total} reports`}>
            <thead>
              <tr>
                <th>Reported content</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {resource.data.items.map((report) => (
                <tr key={report.id}>
                  <td>
                    <button
                      className="link-button"
                      onClick={() => setDetail(report)}
                    >
                      {report.targetType}
                    </button>
                    <small>{report.targetId}</small>
                  </td>
                  <td>{report.reason}</td>
                  <td>
                    <Badge>{report.status}</Badge>
                  </td>
                  <td>
                    <div className="actions">
                      {report.status === "OPEN" &&
                        (["DISMISS", "HIDE", "DELETE"] as const).map(
                          (action) => (
                            <button
                              key={action}
                              onClick={() => {
                                setError("");
                                setNotes("");
                                setPending({ report, action });
                              }}
                            >
                              {action.toLowerCase()}
                            </button>
                          ),
                        )}
                      {report.status === "RESOLVED_HIDDEN" && (
                        <button
                          onClick={() => {
                            setError("");
                            setPending({ report, action: "CONTENT_DELETE" });
                          }}
                        >
                          Delete content
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination
            page={filters.page}
            pageCount={resource.data.pageCount}
            onChange={(page) => setFilters({ ...filters, page })}
          />
        </>
      )}
      {detail && (
        <Dialog title="Report details" onClose={() => setDetail(undefined)}>
          <dl>
            <dt>Reason</dt>
            <dd>{detail.reason}</dd>
            <dt>Reporter</dt>
            <dd>
              {detail.reporter?.name ?? "Unavailable"} {detail.reporter?.email}
            </dd>
            <dt>Content reference</dt>
            <dd>
              {detail.targetType} / {detail.targetId}
            </dd>
            <dt>Submitted</dt>
            <dd>{date(detail.createdAt, true)}</dd>
            <dt>Resolution</dt>
            <dd>{detail.resolutionNotes || detail.status}</dd>
          </dl>
          <p>
            Review the referenced content in its owning module. A content
            preview is not returned by this API.
          </p>
        </Dialog>
      )}
      {pending && (
        <ConfirmDialog
          title={`${pending.action.replace("_", " ").toLowerCase()} reported content?`}
          busy={busy}
          error={error}
          onCancel={() => setPending(undefined)}
          onConfirm={confirm}
        >
          <p>{pending.report.reason}</p>
          <p>
            Target: {pending.report.targetType} / {pending.report.targetId}
          </p>
          {pending.action.includes("DELETE") && (
            <p>
              Deletion cannot be undone here. Related open reports will also be
              resolved.
            </p>
          )}
          {pending.action !== "CONTENT_DELETE" && (
            <Textarea
              label="Resolution notes (optional)"
              maxLength={500}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          )}
        </ConfirmDialog>
      )}
    </>
  );
}
function ResourceState({
  resource,
}: {
  resource: {
    loading: boolean;
    error?: string;
    data?: { items: unknown[] };
    reload(): void;
  };
}) {
  return (
    <>
      {resource.loading && <Skeleton />}
      <Notice error>{resource.error}</Notice>
      {resource.error && <button onClick={resource.reload}>Try again</button>}
      {resource.data && !resource.data.items.length && <EmptyState />}
    </>
  );
}
function date(value: string, time = false) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : time
      ? parsed.toLocaleString()
      : parsed.toLocaleDateString();
}
