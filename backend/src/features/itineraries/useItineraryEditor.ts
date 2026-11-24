import { useState } from 'react';
import { ActivityItem, BudgetCategory, Itinerary, ItineraryDay } from './types';

function moveItem<T>(list: T[], fromIndex: number, toIndex: number): T[] {
  if (toIndex < 0 || toIndex >= list.length || fromIndex === toIndex) return list;
  const copy = [...list];
  const [moved] = copy.splice(fromIndex, 1);
  copy.splice(toIndex, 0, moved);
  return copy;
}

export function useItineraryEditor(initial: Itinerary) {
  const [itinerary, setItinerary] = useState<Itinerary>(initial);

  const renumberDays = (days: ItineraryDay[]): ItineraryDay[] =>
    days.map((d, idx) => ({ ...d, dayNumber: idx + 1 }));

  const setMeta = (
    patch: Partial<Pick<Itinerary, 'title' | 'description' | 'isPublic' | 'baseCurrency'>>,
  ) => {
    setItinerary((prev) => ({ ...prev, ...patch }));
  };

  const addDay = (city = '', date = '') => {
    setItinerary((prev) => {
      const newDay: ItineraryDay = {
        id: crypto.randomUUID(),
        dayNumber: prev.days.length + 1,
        date,
        city,
        activities: [],
      };
      return { ...prev, days: renumberDays([...prev.days, newDay]) };
    });
  };

  const updateDay = (dayId: string, patch: Partial<ItineraryDay>) => {
    setItinerary((prev) => ({
      ...prev,
      days: prev.days.map((d) => (d.id === dayId ? { ...d, ...patch } : d)),
    }));
  };

  const deleteDay = (dayId: string) => {
    setItinerary((prev) => ({
      ...prev,
      days: renumberDays(prev.days.filter((d) => d.id !== dayId)),
    }));
  };

  const reorderDay = (dayId: string, direction: 'up' | 'down') => {
    setItinerary((prev) => {
      const idx = prev.days.findIndex((d) => d.id === dayId);
      if (idx === -1) return prev;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      return { ...prev, days: renumberDays(moveItem(prev.days, idx, targetIdx)) };
    });
  };

  const addActivity = (
    dayId: string,
    input: {
      title: string;
      city?: string;
      startTime?: string;
      notes?: string;
      imageUrls?: string[];
      category: BudgetCategory;
      amount: number;
      currency: string;
    },
  ) => {
    setItinerary((prev) => ({
      ...prev,
      days: prev.days.map((day) => {
        if (day.id !== dayId) return day;
        const activity: ActivityItem = {
          id: crypto.randomUUID(),
          title: input.title,
          city: input.city || day.city,
          startTime: input.startTime,
          notes: input.notes,
          imageUrls: input.imageUrls || [],
          budget: {
            category: input.category,
            amount: Number(input.amount) || 0,
            currency: input.currency || prev.baseCurrency,
          },
        };
        return { ...day, activities: [...day.activities, activity] };
      }),
    }));
  };

  const updateActivity = (dayId: string, activityId: string, patch: Partial<ActivityItem>) => {
    setItinerary((prev) => ({
      ...prev,
      days: prev.days.map((day) =>
        day.id !== dayId
          ? day
          : {
              ...day,
              activities: day.activities.map((act) =>
                act.id === activityId
                  ? { ...act, ...patch, budget: { ...act.budget, ...(patch.budget || {}) } }
                  : act,
              ),
            },
      ),
    }));
  };

  const deleteActivity = (dayId: string, activityId: string) => {
    setItinerary((prev) => ({
      ...prev,
      days: prev.days.map((day) =>
        day.id !== dayId
          ? day
          : { ...day, activities: day.activities.filter((a) => a.id !== activityId) },
      ),
    }));
  };

  const reorderActivity = (dayId: string, activityId: string, direction: 'up' | 'down') => {
    setItinerary((prev) => ({
      ...prev,
      days: prev.days.map((day) => {
        if (day.id !== dayId) return day;
        const idx = day.activities.findIndex((a) => a.id === activityId);
        if (idx === -1) return day;
        const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
        return { ...day, activities: moveItem(day.activities, idx, targetIdx) };
      }),
    }));
  };

  return {
    itinerary,
    setMeta,
    addDay,
    updateDay,
    deleteDay,
    reorderDay,
    addActivity,
    updateActivity,
    deleteActivity,
    reorderActivity,
  };
}