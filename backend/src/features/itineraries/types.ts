export type BudgetCategory = 'food' | 'accommodation' | 'transportation' | 'activity';

export interface ActivityItem {
  id: string;
  title: string;
  city: string;
  startTime?: string;
  notes?: string;
  imageUrls: string[];
  budget: {
    category: BudgetCategory;
    amount: number;
    currency: string;
  };
}

export interface ItineraryDay {
  id: string;
  dayNumber: number;
  date?: string;
  city: string;
  activities: ActivityItem[];
}

export interface BudgetBreakdown {
  food: number;
  accommodation: number;
  transportation: number;
  activity: number;
  totalInBaseCurrency: number;
  baseCurrency: string;
  convertedTotal?: {
    amount: number;
    targetCurrency: string;
    rate: number;
  };
}

export interface Itinerary {
  id: string;
  title: string;
  description?: string;
  isPublic: boolean;
  ownerId?: string;
  sourceItineraryId?: string;
  baseCurrency: string;
  days: ItineraryDay[];
}