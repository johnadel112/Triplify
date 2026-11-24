import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useItineraryEditor } from '../features/itineraries/useItineraryEditor';
import { itinerariesApi } from '../features/itineraries/itineraries.api';
import { BudgetPanel } from '../features/itineraries/BudgetPanel';
import { VisibilityAndCloneControls } from '../features/itineraries/VisibilityAndCloneControls';

export const CreateItineraryPage: React.FC = () => {
  const navigate = useNavigate();
  const { itinerary, setMeta, addDay, updateDay, deleteDay, addActivity } = useItineraryEditor({
    id: '',
    title: '',
    description: '',
    isPublic: false,
    baseCurrency: 'EGP',
    days: [{ id: crypto.randomUUID(), dayNumber: 1, city: '', activities: [] }],
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const created = await itinerariesApi.create(itinerary);
    navigate(`/itineraries/${created.id}/edit`);
  };

  return (
    <form onSubmit={handleSave}>
      <h1>Create Itinerary</h1>
      <input
        type="text"
        placeholder="Itinerary title"
        value={itinerary.title}
        onChange={(e) => setMeta({ title: e.target.value })}
        required
      />
      <input
        type="text"
        maxLength={3}
        placeholder="Base currency (e.g. EGP, USD, EUR)"
        value={itinerary.baseCurrency}
        onChange={(e) => setMeta({ baseCurrency: e.target.value.toUpperCase() })}
      />

      <VisibilityAndCloneControls
        isPublic={itinerary.isPublic}
        onTogglePublic={(isPublic) => setMeta({ isPublic })}
      />

      <button type="button" onClick={() => addDay('')}>
        Add Day
      </button>

      {itinerary.days.map((day) => (
        <div key={day.id}>
          <h3>Day {day.dayNumber}</h3>
          <input
            type="text"
            placeholder="City"
            value={day.city}
            onChange={(e) => updateDay(day.id, { city: e.target.value })}
          />
          <button type="button" onClick={() => deleteDay(day.id)}>
            Remove Day
          </button>
        </div>
      ))}

      <BudgetPanel
        itinerary={itinerary}
        onAddBudgetEntry={(dayId, entry) =>
          addActivity(dayId, {
            title: entry.title,
            category: entry.category,
            amount: entry.amount,
            currency: entry.currency,
          })
        }
      />

      <button type="submit">Save Itinerary</button>
    </form>
  );
};