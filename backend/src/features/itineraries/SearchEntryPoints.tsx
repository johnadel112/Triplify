import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Itinerary } from './types';

interface Props {
  itinerary: Itinerary;
  activeCity?: string;
  activeDate?: string;
}

export const SearchEntryPoints: React.FC<Props> = ({ itinerary, activeCity, activeDate }) => {
  const navigate = useNavigate();

  const cities = itinerary.days.map((d) => d.city).filter(Boolean);
  const origin = cities[0] || '';
  const destination = activeCity || cities[cities.length - 1] || '';

  const goToFlights = () => {
    const params = new URLSearchParams({
      itineraryId: itinerary.id,
      ...(origin ? { origin } : {}),
      ...(destination ? { destination } : {}),
      ...(activeDate ? { date: activeDate } : {}),
    });
    navigate(`/flights/search?${params.toString()}`);
  };

  const goToHotels = () => {
    const params = new URLSearchParams({
      itineraryId: itinerary.id,
      ...(destination ? { city: destination } : {}),
      ...(activeDate ? { checkIn: activeDate } : {}),
    });
    navigate(`/hotels/search?${params.toString()}`);
  };

  return (
    <div>
      <button type="button" onClick={goToFlights}>
        Search Flights
      </button>
      <button type="button" onClick={goToHotels}>
        Search Hotels {destination ? `in ${destination}` : ''}
      </button>
    </div>
  );
};