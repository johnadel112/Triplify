 import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Itinerary } from '../features/itineraries/types';
import { itinerariesApi } from '../features/itineraries/itineraries.api';
import { useItineraryEditor } from '../features/itineraries/useItineraryEditor';
import { DayEditorCard } from '../features/itineraries/DayEditorCard';
import { BudgetPanel } from '../features/itineraries/BudgetPanel';
import { VisibilityAndCloneControls } from '../features/itineraries/VisibilityAndCloneControls';
import { SearchEntryPoints } from '../features/itineraries/SearchEntryPoints';

const EditorWorkspace: React.FC<{ initialData: Itinerary }> = ({ initialData }) => {
  const navigate = useNavigate();
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const {
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
  } = useItineraryEditor(initialData);

  const handleSave = async () => {
    await itinerariesApi.update(itinerary.id, itinerary);
    setSavedMessage('Saved');
  };

  const handleClone = async () => {
    const cloned = await itinerariesApi.cloneItinerary(itinerary.id);
    navigate(`/itineraries/${cloned.id}/edit`);
  };

  return (
    <div>
      <h1>Edit Itinerary</h1>
      <input
        type="text"
        value={itinerary.title}
        onChange={(e) => setMeta({ title: e.target.value })}
      />

      <VisibilityAndCloneControls
        isPublic={itinerary.isPublic}
        onTogglePublic={(isPublic) => setMeta({ isPublic })}
        canClone
        onClone={handleClone}
      />

      <SearchEntryPoints
        itinerary={itinerary}
        activeCity={itinerary.days[0]?.city}
        activeDate={itinerary.days[0]?.date}
      />

      <button type="button" onClick={() => addDay('')}>
        Add Day
      </button>

      {itinerary.days.map((day, dIdx) => (
        <DayEditorCard
          key={day.id}
          day={day}
          dayIndex={dIdx}
          totalDays={itinerary.days.length}
          baseCurrency={itinerary.baseCurrency}
          onUpdateDay={(patch) => updateDay(day.id, patch)}
          onDeleteDay={() => deleteDay(day.id)}
          onReorderDay={(dir) => reorderDay(day.id, dir)}
          onAddActivity={(data) => addActivity(day.id, data)}
          onUpdateActivity={(actId, patch) => updateActivity(day.id, actId, patch)}
          onDeleteActivity={(actId) => deleteActivity(day.id, actId)}
          onReorderActivity={(actId, dir) => reorderActivity(day.id, actId, dir)}
        />
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

      <button type="button" onClick={handleSave}>
        Save Changes
      </button>
      {savedMessage && <span>{savedMessage}</span>}
    </div>
  );
};

export const EditItineraryPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Itinerary | null>(null);

  useEffect(() => {
    if (!id) return;
    itinerariesApi.getById(id).then(setData).catch(console.error);
  }, [id]);

  if (!data) return <p>Loading itinerary...</p>;
  return <EditorWorkspace initialData={data} />;
};