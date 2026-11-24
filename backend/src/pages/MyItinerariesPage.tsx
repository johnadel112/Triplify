import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Itinerary } from '../features/itineraries/types';
import { itinerariesApi } from '../features/itineraries/itineraries.api';

export const MyItinerariesPage: React.FC = () => {
  const [items, setItems] = useState<Itinerary[]>([]);
  const [publicItems, setPublicItems] = useState<Itinerary[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    itinerariesApi.listMine().then(setItems).catch(console.error);
    itinerariesApi.listPublic().then(setPublicItems).catch(console.error);
  }, []);

  const handleClone = async (id: string) => {
    const cloned = await itinerariesApi.cloneItinerary(id);
    navigate(`/itineraries/${cloned.id}/edit`);
  };

  return (
    <div>
      <h1>My Itineraries</h1>
      <Link to="/itineraries/new">Create Itinerary</Link>

      <ul>
        {items.map((it) => (
          <li key={it.id}>
            <strong>{it.title}</strong> ({it.isPublic ? 'Public' : 'Private'}){' '}
            <Link to={`/itineraries/${it.id}/edit`}>Edit</Link>
          </li>
        ))}
      </ul>

      <h2>Public Itineraries</h2>
      <ul>
        {publicItems.map((it) => (
          <li key={it.id}>
            <strong>{it.title}</strong>{' '}
            <button type="button" onClick={() => handleClone(it.id)}>
              Clone
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};