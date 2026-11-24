import React, { useState } from 'react';
import { ActivityItem, BudgetCategory } from './types';
import { ActivityImageUploader } from './ActivityImageUploader';

interface Props {
  defaultCity: string;
  defaultCurrency: string;
  initialActivity?: ActivityItem;
  onSave: (data: Omit<ActivityItem, 'id'>) => void;
  onCancel: () => void;
}

export const ActivityFormModal: React.FC<Props> = ({
  defaultCity,
  defaultCurrency,
  initialActivity,
  onSave,
  onCancel,
}) => {
  const [title, setTitle] = useState(initialActivity?.title || '');
  const [city, setCity] = useState(initialActivity?.city || defaultCity);
  const [startTime, setStartTime] = useState(initialActivity?.startTime || '');
  const [notes, setNotes] = useState(initialActivity?.notes || '');
  const [category, setCategory] = useState<BudgetCategory>(
    initialActivity?.budget.category || 'activity',
  );
  const [amount, setAmount] = useState<number>(initialActivity?.budget.amount ?? 0);
  const [currency, setCurrency] = useState(initialActivity?.budget.currency || defaultCurrency);
  const [imageUrls, setImageUrls] = useState<string[]>(initialActivity?.imageUrls || []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      city: city.trim(),
      startTime,
      notes,
      imageUrls,
      budget: {
        category,
        amount: Number(amount) || 0,
        currency: currency.trim().toUpperCase() || defaultCurrency,
      },
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <h4>{initialActivity ? 'Edit Activity' : 'Add Activity'}</h4>
      <input
        type="text"
        placeholder="Activity title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
      />
      <input
        type="text"
        placeholder="City"
        value={city}
        onChange={(e) => setCity(e.target.value)}
      />
      <input
        type="time"
        value={startTime}
        onChange={(e) => setStartTime(e.target.value)}
      />
      <select value={category} onChange={(e) => setCategory(e.target.value as BudgetCategory)}>
        <option value="food">Food</option>
        <option value="accommodation">Accommodation</option>
        <option value="transportation">Transportation</option>
        <option value="activity">Activity</option>
      </select>
      <input
        type="number"
        min={0}
        step="0.01"
        value={amount}
        onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
      />
      <input
        type="text"
        maxLength={3}
        value={currency}
        onChange={(e) => setCurrency(e.target.value.toUpperCase())}
      />
      <textarea
        placeholder="Notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <ActivityImageUploader imageUrls={imageUrls} onChange={setImageUrls} />
      <button type="submit">Save Activity</button>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
};