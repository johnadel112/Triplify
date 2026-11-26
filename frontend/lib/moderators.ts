import { apiRequest } from "./api";

export interface AirlineCancellationTier {
  daysBefore: number;
  refundPercentage: number;
}

export interface BaggagePolicy {
  extraBagPrice: number;
  maxExtraBagsPerPassenger: number;
}

export interface Airline {
  id?: string;
  _id?: string;
  name: string;
  code?: string;
  logoUrl?: string;
  contactEmail?: string;
  baggagePolicy?: BaggagePolicy;
  cancellationPolicy?: {
    tiers: AirlineCancellationTier[];
  };
}

export interface FlightCabin {
  seatCount: number;
  price: number;
  freeBags?: number;
  maxBagWeightKg?: number;
}

export type CabinClass = "economy" | "premiumEconomy" | "business" | "first";

export type CabinMap = Partial<Record<CabinClass, FlightCabin>>;

export interface FlightCancellationTier {
  hoursBeforeDeparture: number;
  refundPercentage: number;
}

export interface Flight {
  _id: string;
  id?: string;
  flightNumber: string;
  airlineId?: string;
  departureAirport: string;
  arrivalAirport: string;
  departureTimeUtc: string;
  arrivalTimeUtc: string;
  departureDate?: string;
  departureTimeLocal?: string;
  arrivalTimeLocal?: string;
  cabins: CabinMap;
  extraBaggagePricePerKg?: number;
  cancellationTiers?: FlightCancellationTier[];
  status: "SCHEDULED" | "CANCELLED";
  hasConfirmedBookings?: boolean;
}

export interface FlightBookingPassenger {
  name: string;
  type: string;
}

export interface FlightBookingItem {
  id: string;
  reference: string;
  status: "CONFIRMED" | "CANCELLED";
  cabinClass: CabinClass;
  seats: number;
  passengers: FlightBookingPassenger[];
  total: number;
  currency: string;
  confirmedAt?: string;
}

export interface FlightBookingsResult {
  flight: {
    id: string;
    flightNumber: string;
    status: string;
    departureTimeUtc: string;
    seatsRemaining: Record<string, number>;
  };
  total: number;
  page: number;
  pageCount: number;
  bookings: FlightBookingItem[];
}

export interface HotelCancellationTier {
  daysBefore: number;
  refundPercentage: number;
}

export interface HotelPolicies {
  checkInTime?: string;
  checkOutTime?: string;
  cancellationTiers?: HotelCancellationTier[];
}

export interface Hotel {
  _id?: string;
  id?: string;
  name: string;
  description: string;
  city: string;
  country: string;
  address: string;
  starClass: number;
  amenities?: string[];
  images?: string[];
  timeZone?: string;
  checkInTime?: string;
  checkOutTime?: string;
  cancellationTiers?: HotelCancellationTier[];
  active?: boolean;
  verified?: boolean;
}

export interface DateRange {
  from: string;
  to: string;
}

export interface HotelRoom {
  _id: string;
  hotelId: string;
  name: string;
  number: string;
  type: string;
  beds: number;
  maxOccupancy: number;
  pricePerNight: number;
  active: boolean;
  availableRanges?: DateRange[];
  blockedRanges?: DateRange[];
}

export interface HotelReservationGuest {
  id: string;
  name: string;
}

export interface HotelReservationRoom {
  roomId: string;
  name: string;
  type: string;
  adults: number;
  childrenCount: number;
  pricePerNight: number;
  subtotal: number;
}

export interface HotelReservation {
  id: string;
  reference: string | null;
  hotelId: string;
  hotelName: string;
  guest: HotelReservationGuest;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  status: "PENDING_PAYMENT" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "EXPIRED";
  rooms: HotelReservationRoom[];
  total: number;
  currency: string;
  createdAt: string;
}

export interface AirportItem {
  code: string;
  name: string;
  city: string;
  country: string;
  timeZone: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageCount: number;
}

export const airlineApi = {
  getProfile: (airlineId: string) =>
    apiRequest<Airline>(`/airlines/${airlineId}`),

  updateProfile: (data: {
    code?: string;
    name?: string;
    logoUrl?: string;
    contactEmail?: string;
  }) =>
    apiRequest<Airline>("/flights/airline-profile", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  uploadLogo: (airlineId: string, file: File) => {
    const formData = new FormData();
    formData.append("logo", file);
    return apiRequest<{ logoUrl: string }>(`/airlines/${airlineId}/logo`, {
      method: "POST",
      body: formData,
    });
  },

  updateBaggagePolicy: (airlineId: string, data: BaggagePolicy) =>
    apiRequest<Airline>(`/airlines/${airlineId}/baggage-policy`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  updateCancellationPolicy: (
    airlineId: string,
    data: { tiers: AirlineCancellationTier[] },
  ) =>
    apiRequest<Airline>(`/airlines/${airlineId}/cancellation-policy`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  listFlights: (page = 1) =>
    apiRequest<PaginatedResult<Flight>>(`/flights/manage?page=${page}`),

  getFlight: (flightId: string) =>
    apiRequest<Flight>(`/flights/${flightId}`),

  createFlight: (data: {
    flightNumber: string;
    departureAirportCode: string;
    arrivalAirportCode: string;
    departureTimeLocal: string;
    arrivalTimeLocal: string;
    cabins: CabinMap;
    extraBaggagePricePerKg?: number;
    cancellationTiers?: { hoursBeforeDeparture: number; refundPercentage: number }[];
  }) =>
    apiRequest<Flight>("/flights", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateFlight: (
    flightId: string,
    data: {
      departureTimeLocal?: string;
      arrivalTimeLocal?: string;
      cabins?: CabinMap;
      extraBaggagePricePerKg?: number;
      departureAirport?: string;
      arrivalAirport?: string;
    },
  ) =>
    apiRequest<Flight>(`/flights/${flightId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  cancelFlight: (flightId: string) =>
    apiRequest<{ message: string; cancelledBookings?: number }>(
      `/flights/${flightId}/cancel`,
      {
        method: "POST",
        body: JSON.stringify({ confirmation: true }),
      },
    ),

  getBookings: (flightId: string, page = 1) =>
    apiRequest<FlightBookingsResult>(`/flights/${flightId}/bookings?page=${page}`),

  getPassengerExportUrl: (flightId: string) => {
    const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api").replace(
      /\/$/,
      "",
    );
    return `${apiBase}/flights/${flightId}/passengers/export`;
  },
};

export const hotelApi = {
  getHotel: (hotelId: string) =>
    apiRequest<Hotel>(`/hotels/${hotelId}`),

  updateHotel: (
    hotelId: string,
    data: {
      name?: string;
      description?: string;
      city?: string;
      country?: string;
      address?: string;
      starClass?: number;
      amenities?: string[];
      timeZone?: string;
    },
  ) =>
    apiRequest<Hotel>(`/hotels/${hotelId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  uploadPhotos: (hotelId: string, files: File[]) => {
    const formData = new FormData();
    files.forEach((file) => formData.append("images", file));
    return apiRequest<{ images: string[] }>(`/hotels/${hotelId}/images`, {
      method: "POST",
      body: formData,
    });
  },

  removePhoto: (hotelId: string, imageId: string) =>
    apiRequest<{ message: string }>(`/hotels/${hotelId}/images/${imageId}`, {
      method: "DELETE",
    }),

  updatePolicies: (
    hotelId: string,
    data: {
      checkInTime?: string;
      checkOutTime?: string;
      cancellationTiers?: HotelCancellationTier[];
    },
  ) =>
    apiRequest<Hotel>(`/hotels/${hotelId}/policies`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  listRooms: (hotelId: string, page = 1) =>
    apiRequest<{ items: HotelRoom[]; total: number; page: number; limit: number }>(
      `/hotels/${hotelId}/rooms/manage?page=${page}`,
    ),

  createRoom: (
    hotelId: string,
    data: {
      name: string;
      number: string;
      type: string;
      beds: number;
      maxOccupancy: number;
      pricePerNight: number;
    },
  ) =>
    apiRequest<HotelRoom>(`/hotels/${hotelId}/rooms`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateRoom: (
    hotelId: string,
    roomId: string,
    data: {
      name?: string;
      number?: string;
      type?: string;
      beds?: number;
      maxOccupancy?: number;
      pricePerNight?: number;
    },
  ) =>
    apiRequest<HotelRoom>(`/hotels/${hotelId}/rooms/${roomId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  setRoomStatus: (hotelId: string, roomId: string, active: boolean) =>
    apiRequest<HotelRoom>(`/hotels/${hotelId}/rooms/${roomId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ active }),
    }),

  deleteRoom: (hotelId: string, roomId: string) =>
    apiRequest<{ message: string }>(`/hotels/${hotelId}/rooms/${roomId}`, {
      method: "DELETE",
    }),

  replaceAvailability: (
    hotelId: string,
    roomId: string,
    ranges: DateRange[],
  ) =>
    apiRequest<{ message: string; availableRanges: DateRange[] }>(
      `/hotels/${hotelId}/rooms/${roomId}/availability`,
      {
        method: "PUT",
        body: JSON.stringify({ ranges }),
      },
    ),

  replaceBlocked: (
    hotelId: string,
    roomId: string,
    ranges: DateRange[],
  ) =>
    apiRequest<{ message: string; blockedRanges: DateRange[] }>(
      `/hotels/${hotelId}/rooms/${roomId}/blocked`,
      {
        method: "PUT",
        body: JSON.stringify({ ranges }),
      },
    ),

  listReservations: (
    hotelId: string,
    page = 1,
    status?: string,
  ) => {
    const query = new URLSearchParams({ page: String(page) });
    if (status) query.set("status", status);
    return apiRequest<PaginatedResult<HotelReservation>>(
      `/hotels/${hotelId}/reservations?${query.toString()}`,
    );
  },

  getReservation: (hotelId: string, bookingId: string) =>
    apiRequest<HotelReservation>(
      `/hotels/${hotelId}/reservations/${bookingId}`,
    ),
};

export const referenceApi = {
  listAirports: (search?: string, page = 1) => {
    const query = new URLSearchParams({ page: String(page) });
    if (search) query.set("search", search);
    return apiRequest<PaginatedResult<AirportItem>>(
      `/reference/airports?${query.toString()}`,
    );
  },
};
