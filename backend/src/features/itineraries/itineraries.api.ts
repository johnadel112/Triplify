import { BudgetBreakdown, Itinerary } from './types';

const API_BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Triplify-CSRF': '1',
      ...(options?.headers || {}),
    },
    ...options,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(err.message || 'Request failed');
  }

  return res.json();
}

export const itinerariesApi = {
  listMine: () => request<Itinerary[]>('/itineraries/me'),
  listPublic: (city?: string) =>
    request<Itinerary[]>(`/itineraries/public${city ? `?city=${encodeURIComponent(city)}` : ''}`),
  getById: (id: string) => request<Itinerary>(`/itineraries/${id}`),
  create: (payload: Partial<Itinerary>) =>
    request<Itinerary>('/itineraries', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, payload: Partial<Itinerary>) =>
    request<Itinerary>(`/itineraries/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  cloneItinerary: (id: string) =>
    request<Itinerary>(`/itineraries/${id}/clone`, { method: 'POST' }),
  convertBudget: (id: string, targetCurrency: string) =>
    request<BudgetBreakdown>(
      `/itineraries/${id}/budget-conversion?targetCurrency=${encodeURIComponent(targetCurrency)}`,
    ),
  uploadActivityImage: async (file: File): Promise<{ url: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/itineraries/uploads/activity-image`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-Triplify-CSRF': '1' },
      body: formData,
    });
    if (!res.ok) throw new Error('Image upload failed');
    return res.json();
  },
};