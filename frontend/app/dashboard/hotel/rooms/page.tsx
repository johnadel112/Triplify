"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { hotelApi, HotelRoom } from "@/lib/moderators";
import { ApiError } from "@/lib/api";
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
} from "@/components/ui";

const ROOM_TYPES = [
  "STANDARD_SINGLE",
  "STANDARD_DOUBLE",
  "DELUXE_KING",
  "DELUXE_QUEEN",
  "EXECUTIVE_SUITE",
  "PRESIDENTIAL_SUITE",
  "FAMILY_SUITE",
];

export default function HotelRoomsPage() {
  const { user } = useAuth();
  const providerId = user?.providerId;

  const [page, setPage] = useState(1);
  const [rooms, setRooms] = useState<HotelRoom[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);

  // Create / Edit modal state
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [type, setType] = useState("DELUXE_KING");
  const [beds, setBeds] = useState(1);
  const [maxOccupancy, setMaxOccupancy] = useState(2);
  const [pricePerNight, setPricePerNight] = useState<number | "">(120);
  const [savingRoom, setSavingRoom] = useState(false);
  const [modalError, setModalError] = useState("");

  // Delete dialog state
  const [deletingRoom, setDeletingRoom] = useState<HotelRoom | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    if (!providerId) return;
    let active = true;

    hotelApi
      .listRooms(providerId, page)
      .then((res) => {
        if (!active) return;
        setRooms(res.items || []);
        setTotal(res.total || 0);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError ? err.message : "Failed to load hotel rooms.",
        );
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [providerId, page, revision]);

  function openCreateModal() {
    setModalMode("create");
    setEditingRoomId(null);
    setName("");
    setNumber("");
    setType("DELUXE_KING");
    setBeds(1);
    setMaxOccupancy(2);
    setPricePerNight(120);
    setModalError("");
  }

  function openEditModal(room: HotelRoom) {
    setModalMode("edit");
    setEditingRoomId(room._id);
    setName(room.name);
    setNumber(room.number);
    setType(room.type);
    setBeds(room.beds);
    setMaxOccupancy(room.maxOccupancy);
    setPricePerNight(room.pricePerNight);
    setModalError("");
  }

  async function handleSaveRoom(e: React.FormEvent) {
    e.preventDefault();
    if (!providerId || savingRoom) return;
    setSavingRoom(true);
    setModalError("");

    try {
      if (modalMode === "create") {
        await hotelApi.createRoom(providerId, {
          name: name.trim(),
          number: number.trim(),
          type: type.trim(),
          beds: Number(beds),
          maxOccupancy: Number(maxOccupancy),
          pricePerNight: Number(pricePerNight),
        });
        setNotice(`Room ${number} created successfully.`);
      } else if (modalMode === "edit" && editingRoomId) {
        await hotelApi.updateRoom(providerId, editingRoomId, {
          name: name.trim(),
          number: number.trim(),
          type: type.trim(),
          beds: Number(beds),
          maxOccupancy: Number(maxOccupancy),
          pricePerNight: Number(pricePerNight),
        });
        setNotice(`Room ${number} updated successfully.`);
      }
      setModalMode(null);
      setRevision((r) => r + 1);
    } catch (err) {
      setModalError(
        err instanceof ApiError ? err.message : "Failed to save room.",
      );
    } finally {
      setSavingRoom(false);
    }
  }

  async function handleToggleStatus(room: HotelRoom) {
    if (!providerId) return;
    try {
      await hotelApi.setRoomStatus(providerId, room._id, !room.active);
      setNotice(`Room ${room.number} is now ${!room.active ? "active (bookable)" : "inactive"}.`);
      setRevision((r) => r + 1);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to change room status.",
      );
    }
  }

  async function handleConfirmDelete() {
    if (!providerId || !deletingRoom || deletingBusy) return;
    setDeletingBusy(true);
    setDeleteError("");

    try {
      await hotelApi.deleteRoom(providerId, deletingRoom._id);
      setNotice(`Room ${deletingRoom.number} deleted.`);
      setDeletingRoom(null);
      setRevision((r) => r + 1);
    } catch (err) {
      setDeleteError(
        err instanceof ApiError ? err.message : "Failed to delete room.",
      );
    } finally {
      setDeletingBusy(false);
    }
  }

  const pageCount = Math.ceil(total / 10);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <span className="section-kicker">INVENTORY MANAGEMENT</span>
          <h1>Hotel Rooms</h1>
          <p className="lede">
            Configure room inventory, types, base nightly rates, and bookable/blocked calendar ranges.
          </p>
        </div>
        <div>
          <button className="button" type="button" onClick={openCreateModal} disabled={!providerId}>
            + Add New Room
          </button>
        </div>
      </div>

      <Notice>{notice}</Notice>
      <Notice error>{error}</Notice>

      {loading ? (
        <Skeleton />
      ) : rooms.length === 0 ? (
        <EmptyState>No physical rooms registered for this hotel yet. Add your first room above.</EmptyState>
      ) : (
        <>
          <Table caption={`Hotel rooms (${total} total)`}>
            <thead>
              <tr>
                <th scope="col">Room #</th>
                <th scope="col">Name</th>
                <th scope="col">Type</th>
                <th scope="col">Beds / Guests</th>
                <th scope="col">Rate / Night</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => (
                <tr key={room._id}>
                  <td>
                    <strong>{room.number}</strong>
                  </td>
                  <td>{room.name}</td>
                  <td>
                    <code>{room.type}</code>
                  </td>
                  <td>
                    {room.beds} bed(s) / max {room.maxOccupancy}
                  </td>
                  <td>
                    <strong>${room.pricePerNight.toFixed(2)}</strong>
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(room)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                      }}
                      title="Click to toggle status"
                    >
                      <Badge>
                        {room.active ? (
                          <span style={{ color: "green" }}>ACTIVE</span>
                        ) : (
                          <span style={{ color: "#999" }}>INACTIVE</span>
                        )}
                      </Badge>
                    </button>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="button button-small"
                        onClick={() => openEditModal(room)}
                      >
                        Edit
                      </button>
                      <Link
                        className="button button-small"
                        href={`/dashboard/hotel/rooms/${room._id}`}
                        style={{ background: "transparent", color: "inherit", border: "1px solid var(--line)" }}
                      >
                        Calendar
                      </Link>
                      <button
                        type="button"
                        className="button button-danger button-small"
                        onClick={() => setDeletingRoom(room)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>

          {pageCount > 1 && (
            <Pagination
              page={page}
              pageCount={pageCount}
              onChange={(nextPage) => {
                setLoading(true);
                setPage(nextPage);
              }}
              disabled={loading}
            />
          )}
        </>
      )}

      {/* Create / Edit Modal */}
      {modalMode && (
        <Dialog
          title={modalMode === "create" ? "Add New Room" : `Edit Room ${number}`}
          onClose={() => setModalMode(null)}
        >
          <form onSubmit={handleSaveRoom} className="settings-form" style={{ margin: 0, maxWidth: "100%" }}>
            <Notice error>{modalError}</Notice>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <FormField
                label="Physical Room Number"
                name="number"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                required
                maxLength={40}
                hint="Unique number within this hotel (e.g. 101, 302B)"
              />

              <FormField
                label="Room Name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={100}
                hint="e.g. Deluxe Nile View King"
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <Select
                label="Room Type"
                name="type"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                {ROOM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </option>
                ))}
              </Select>

              <FormField
                label="Price Per Night ($)"
                name="pricePerNight"
                type="number"
                step="0.01"
                min="0.01"
                value={String(pricePerNight)}
                onChange={(e) => setPricePerNight(e.target.value === "" ? "" : Number(e.target.value))}
                required
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <FormField
                label="Beds"
                name="beds"
                type="number"
                min="1"
                max="20"
                value={String(beds)}
                onChange={(e) => setBeds(Number(e.target.value))}
                required
              />

              <FormField
                label="Max Occupancy (Guests)"
                name="maxOccupancy"
                type="number"
                min="1"
                max="30"
                value={String(maxOccupancy)}
                onChange={(e) => setMaxOccupancy(Number(e.target.value))}
                required
              />
            </div>

            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "20px" }}>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                disabled={savingRoom}
              >
                Cancel
              </button>
              <button className="button" type="submit" disabled={savingRoom}>
                {savingRoom ? "Saving…" : modalMode === "create" ? "Create Room" : "Save Changes"}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {/* Delete Confirmation */}
      {deletingRoom && (
        <ConfirmDialog
          title={`Delete room ${deletingRoom.number}?`}
          busy={deletingBusy}
          error={deleteError}
          onCancel={() => setDeletingRoom(null)}
          onConfirm={handleConfirmDelete}
        >
          <p>
            Are you sure you want to delete room <strong>{deletingRoom.name}</strong> (Number: <code>{deletingRoom.number}</code>)?
          </p>
          <p style={{ color: "#c00" }}>
            Rooms with active, confirmed, or pending reservations cannot be deleted until those bookings are completed or cancelled.
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}
