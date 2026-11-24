import React, { useEffect, useState } from 'react';
import { BudgetBreakdown, BudgetCategory, Itinerary } from './types';
import { itinerariesApi } from './itineraries.api';

interface Props {
  itinerary: Itinerary;
  onAddBudgetEntry: (
    dayId: string,
    entry: { title: string; category: BudgetCategory; amount: number; currency: string },
  ) => void;
}

const CATEGORIES: { key: BudgetCategory; label: string }[] = [
  { key: 'food', label: 'Food' },
  { key: 'accommodation', label: 'Accommodation' },
  { key: 'transportation', label: 'Transportation' },
  { key: 'activity', label: 'Activity' },
];

export const BudgetPanel: React.FC<Props> = ({ itinerary, onAddBudgetEntry }) => {
  const [selectedDayId, setSelectedDayId] = useState(itinerary.days[0]?.id || '');
  const [category, setCategory] = useState<BudgetCategory>('food');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [targetCurrency, setTargetCurrency] = useState('USD');
  const [conversion, setConversion] = useState<BudgetBreakdown | null>(null);

  useEffect(() => {
    if (!selectedDayId && itinerary.days[0]) {
      setSelectedDayId(itinerary.days[0].id);
    }
  }, [itinerary.days, selectedDayId]);

  const localTotals = itinerary.days.reduce(
    (acc, day) => {
      for (const act of day.activities) {
        acc[act.budget.category] =
          (acc[act.budget.category] || 0) + (Number(act.budget.amount) || 0);
        acc.total += Number(act.budget.amount) || 0;
      }
      return acc;
    },
    { food: 0, accommodation: 0, transportation: 0, activity: 0, total: 0 },
  );

  const handleFetchConversion = async () => {
    if (!itinerary.id) return;
    const data = await itinerariesApi.convertBudget(itinerary.id, targetCurrency);
    setConversion(data);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDayId || !title.trim()) return;
    onAddBudgetEntry(selectedDayId, {
      title: title.trim(),
      category,
      amount: Number(amount) || 0,
      currency: itinerary.baseCurrency,
    });
    setTitle('');
    setAmount(0);
  };

  return (
    <section>
      <h3>Budgets ({itinerary.baseCurrency})</h3>

      <form onSubmit={handleSubmit}>
        <select value={selectedDayId} onChange={(e) => setSelectedDayId(e.target.value)}>
          {itinerary.days.map((d) => (
            <option key={d.id} value={d.id}>
              Day {d.dayNumber} {d.city ? `- ${d.city}` : ''}
            </option>
          ))}
        </select>

        <select value={category} onChange={(e) => setCategory(e.target.value as BudgetCategory)}>
          {CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Budget item label"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <input
          type="number"
          min={0}
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
        />

        <button type="submit">Add Budget Item</button>
      </form>

      <ul>
        <li>
          Food: {localTotals.food.toFixed(2)} {itinerary.baseCurrency}
        </li>
        <li>
          Accommodation: {localTotals.accommodation.toFixed(2)} {itinerary.baseCurrency}
        </li>
        <li>
          Transportation: {localTotals.transportation.toFixed(2)} {itinerary.baseCurrency}
        </li>
        <li>
          Activity: {localTotals.activity.toFixed(2)} {itinerary.baseCurrency}
        </li>
        <li>
          <strong>
            Total: {localTotals.total.toFixed(2)} {itinerary.baseCurrency}
          </strong>
        </li>
      </ul>

      <div>
        <label>
          Convert to Currency:
          <input
            type="text"
            maxLength={3}
            value={targetCurrency}
            onChange={(e) => setTargetCurrency(e.target.value.toUpperCase())}
          />
        </label>
        <button type="button" onClick={handleFetchConversion}>
          Convert via Backend Rate
        </button>
        {conversion?.convertedTotal && (
          <p>
            Converted Total:{' '}
            <strong>
              {conversion.convertedTotal.amount.toFixed(2)} {conversion.convertedTotal.targetCurrency}
            </strong>{' '}
            (rate: {conversion.convertedTotal.rate})
          </p>
        )}
      </div>
    </section>
  );
};