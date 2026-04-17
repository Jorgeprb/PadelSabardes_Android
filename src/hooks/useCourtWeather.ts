import { useEffect, useState } from 'react';
import { CourtWeatherForecast, fetchCourtWeatherForecast } from '../services/weather';

export const useCourtWeather = () => {
  const [forecast, setForecast] = useState<CourtWeatherForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;

    fetchCourtWeatherForecast()
      .then((data) => {
        if (!isMounted) return;
        setForecast(data);
        setError(false);
      })
      .catch((err) => {
        console.error('Error loading weather forecast:', err);
        if (!isMounted) return;
        setError(true);
      })
      .finally(() => {
        if (!isMounted) return;
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return { forecast, loading, error };
};
