"use client";
import { useState } from "react";
import { adminApi, queryString, type Account, type Page } from "@/lib/admin";
import { useResource } from "@/lib/use-resource";
import { FormField } from "@/components/form-field";
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
  Toast,
} from "@/components/ui";
import { ApiError } from "@/lib/api";
export default function AccountsPage() {
  const [filters, setFilters] = useState({
    search: "",
    role: "",
    status: "",
    page: 1,
  });
  const resource = useResource<Page<Account>>(
    `/admin/users?${queryString(filters)}`,
  );
  const [action, setAction] = useState<{
    account: Account;
    kind: "suspend" | "reactivate" | "reset";
  }>();
  const [detail, setDetail] = useState<Account>();
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function confirm() {
    if (!action || busy) return;
    setBusy(true);
    setError("");
    try {
      if (action.kind === "reset")
        setSecret((await adminApi.reset(action.account.id)).temporaryPassword);
      else
        await adminApi.accountStatus(
          action.account,
          action.kind === "reactivate",
        );
      setNotice("Account action completed.");
      setAction(undefined);
      resource.reload();
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "Unable to complete the action.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <span className="section-kicker">ACCESS MANAGEMENT</span>
      <h1>User accounts</h1>
      <p>Review accounts and manage access. Suspensions end active sessions.</p>
      <form
        className="filters"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          setFilters({
            search: String(data.get("search")),
            role: String(data.get("role")),
            status: String(data.get("status")),
            page: 1,
          });
        }}
      >
        <FormField label="Name or email" name="search" maxLength={100} />
        <Select label="Role" name="role">
          <option value="">All roles</option>
          {["USER", "ADMIN", "AIRLINE_MODERATOR", "HOTEL_MODERATOR"].map(
            (value) => (
              <option key={value}>{value}</option>
            ),
          )}
        </Select>
        <Select label="Status" name="status">
          <option value="">All statuses</option>
          {["ACTIVE", "SUSPENDED", "DEACTIVATED"].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </Select>
        <button className="button">Apply filters</button>
      </form>
      <Toast message={notice} onDismiss={() => setNotice("")} />
      <Notice error>{resource.error}</Notice>
      {resource.error && <button onClick={resource.reload}>Try again</button>}
      {resource.loading && <Skeleton />}
      {resource.data && (
        <>
          <Table caption={`${resource.data.total} accounts`}>
            <thead>
              <tr>
                <th>Name / email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {resource.data.items.map((account) => (
                <tr key={account.id}>
                  <td>
                    <button
                      className="link-button"
                      onClick={() => setDetail(account)}
                    >
                      {account.name}
                    </button>
                    <small>{account.email}</small>
                  </td>
                  <td>{account.role.replaceAll("_", " ")}</td>
                  <td>
                    <Badge>{account.status}</Badge>
                  </td>
                  <td>
                    <div className="actions">
                      {account.role !== "ADMIN" &&
                        account.status !== "DEACTIVATED" && (
                          <>
                            {["ACTIVE", "SUSPENDED"].includes(
                              account.status,
                            ) && (
                              <button
                                onClick={() => {
                                  setError("");
                                  setAction({
                                    account,
                                    kind:
                                      account.status === "ACTIVE"
                                        ? "suspend"
                                        : "reactivate",
                                  });
                                }}
                              >
                                {account.status === "ACTIVE"
                                  ? "Suspend"
                                  : "Reactivate"}
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setError("");
                                setAction({ account, kind: "reset" });
                              }}
                            >
                              Reset password
                            </button>
                          </>
                        )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          {!resource.data.items.length && <EmptyState />}
          <Pagination
            page={filters.page}
            pageCount={resource.data.pageCount}
            onChange={(page) => setFilters({ ...filters, page })}
          />
        </>
      )}
      {detail && (
        <Dialog title={detail.name} onClose={() => setDetail(undefined)}>
          <dl>
            {Object.entries(detail).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </Dialog>
      )}
      {action && (
        <ConfirmDialog
          title={`${action.kind === "reset" ? "Reset password for" : action.kind === "suspend" ? "Suspend" : "Reactivate"} ${action.account.name}?`}
          busy={busy}
          error={error}
          onCancel={() => setAction(undefined)}
          onConfirm={confirm}
        >
          <p>
            {action.kind === "reset"
              ? "All sessions will end. A temporary password will be shown once; the account holder must replace it at the next login."
              : "This changes account access. Provider availability is managed separately."}
          </p>
          <p>{action.account.email}</p>
        </ConfirmDialog>
      )}
      {secret && (
        <Dialog title="Temporary password" onClose={() => setSecret("")}>
          <p>
            Share securely with the account holder. This credential disappears
            when you close this dialog.
          </p>
          <code className="temporary-password">{secret}</code>
          <p>A password change is required at next login.</p>
        </Dialog>
      )}
    </>
  );
}
