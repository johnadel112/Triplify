import React, { useState } from 'react';
import { ActivityItem, ItineraryDay } from './types';
import { ActivityFormModal } from './ActivityFormModal';

interface Props {
  day: ItineraryDay;
  dayIndex: number;
  totalDays: number;
  baseCurrency: string;
  onUpdateDay: (patch: Partial<ItineraryDay>) => void;
  onDeleteDay: () => void;
  onReorderDay: (direction: 'up' | 'down') => void;
  onAddActivity: (data: Omit<ActivityItem, 'id'>) => void;
  onUpdateActivity: (activityId: string, patch: Partial<ActivityItem>) => void;
  onDeleteActivity: (activityId: string) => void;
  onReorderActivity: (activityId: string, direction: 'up' | 'down') => void;
}

export const DayEditorCard: React.FC<Props> = ({
  day,
  dayIndex,
  totalDays,
  baseCurrency,
  onUpdateDay,
  onDeleteDay,
  onReorderDay,
  onAddActivity,
  onUpdateActivity,
  onDeleteActivity,
  onReorderActivity,
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingActivity, setEditingActivity] = useState<ActivityItem | null>(null);

  return (
    <div>
      <h3>Day {day.dayNumber}</h3>
      <input
        type="date"
        value={day.date || ''}
        onChange={(e) => onUpdateDay({ date: e.target.value })}
      />
      <input
        type="text"
        placeholder="City"
        value={day.city}
        onChange={(e) => onUpdateDay({ city: e.target.value })}
      />

      <button type="button" disabled={dayIndex === 0} onClick={() => onReorderDay('up')}>
        Move Day Up
      </button>
      <button
        type="button"
        disabled={dayIndex === totalDays - 1}
        onClick={() => onReorderDay('down')}
      >
        Move Day Down
      </button>
      <button type="button" onClick={onDeleteDay}>
        Delete Day
      </button>

      <button type="button" onClick={() => setShowAddForm(true)}>
        + Add Activity
      </button>

      {showAddForm && (
        <ActivityFormModal
          defaultCity={day.city}
          defaultCurrency={baseCurrency}
          onSave={(data) => {
            onAddActivity(data);
            setShowAddForm(false);
          }}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {editingActivity && (
        <ActivityFormModal
          defaultCity={day.city}
          defaultCurrency={baseCurrency}
          initialActivity={editingActivity}
          onSave={(data) => {
            onUpdateActivity(editingActivity.id, data);
            setEditingActivity(null);
          }}
          onCancel={() => setEditingActivity(null)}
        />
      )}

      <ul>
        {day.activities.map((act, idx) => (
          <li key={act.id}>
            <strong>{act.title}</strong> ({act.city || day.city}) — {act.budget.amount}{' '}
            {act.budget.currency} [{act.budget.category}]
            <button type="button" onClick={() => setEditingActivity(act)}>
              Edit
            </button>
            <button
              type="button"
              disabled={idx === 0}
              onClick={() => onReorderActivity(act.id, 'up')}
            >
              Up
            </button>
            <button
              type="button"
              disabled={idx === day.activities.length - 1}
              onClick={() => onReorderActivity(act.id, 'down')}
            >
              Down
            </button>
            <button type="button" onClick={() => onDeleteActivity(act.id)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};