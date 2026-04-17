const WEATHER_LATITUDE = 42.779083;
const WEATHER_LONGITUDE = -8.87675;
const WEATHER_TIMEZONE = 'Europe/Madrid';
const WEATHER_CACHE_MS = 15 * 60 * 1000;

export type WeatherVisualKind =
  | 'clear'
  | 'mostlyClear'
  | 'partlyCloudy'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'showers'
  | 'snow'
  | 'storm';

export type WeatherTranslationKey =
  | 'weather_clear'
  | 'weather_mostly_clear'
  | 'weather_partly_cloudy'
  | 'weather_cloudy'
  | 'weather_fog'
  | 'weather_drizzle'
  | 'weather_rain'
  | 'weather_showers'
  | 'weather_snow'
  | 'weather_storm';

export interface CourtDailyWeather {
  date: string;
  tempMax: number | null;
  tempMin: number | null;
  weatherCode: number;
  visualKind: WeatherVisualKind;
  labelKey: WeatherTranslationKey;
}

export interface CourtHourlyWeather {
  isoTime: string;
  date: string;
  hour: string;
  temperature: number | null;
  weatherCode: number;
  isDay: boolean;
  visualKind: WeatherVisualKind;
  labelKey: WeatherTranslationKey;
}

export interface CourtWeatherForecast {
  daily: CourtDailyWeather[];
  hourly: CourtHourlyWeather[];
  fetchedAt: number;
}

type OpenMeteoResponse = {
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
  };
  hourly?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m?: number[];
    is_day?: number[];
  };
};

type WeatherCache = {
  data: CourtWeatherForecast | null;
  expiresAt: number;
  pending: Promise<CourtWeatherForecast> | null;
};

const cache: WeatherCache = {
  data: null,
  expiresAt: 0,
  pending: null,
};

const mapWeatherCode = (weatherCode: number): Omit<CourtDailyWeather, 'date' | 'tempMax' | 'tempMin' | 'weatherCode'> => {
  if (weatherCode === 0) return { visualKind: 'clear', labelKey: 'weather_clear' };
  if (weatherCode === 1) return { visualKind: 'mostlyClear', labelKey: 'weather_mostly_clear' };
  if (weatherCode === 2) return { visualKind: 'partlyCloudy', labelKey: 'weather_partly_cloudy' };
  if (weatherCode === 3) return { visualKind: 'cloudy', labelKey: 'weather_cloudy' };
  if (weatherCode === 45 || weatherCode === 48) return { visualKind: 'fog', labelKey: 'weather_fog' };
  if ([51, 53, 55, 56, 57].includes(weatherCode)) return { visualKind: 'drizzle', labelKey: 'weather_drizzle' };
  if ([61, 63, 65, 66, 67].includes(weatherCode)) return { visualKind: 'rain', labelKey: 'weather_rain' };
  if ([80, 81, 82].includes(weatherCode)) return { visualKind: 'showers', labelKey: 'weather_showers' };
  if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) return { visualKind: 'snow', labelKey: 'weather_snow' };
  if ([95, 96, 99].includes(weatherCode)) return { visualKind: 'storm', labelKey: 'weather_storm' };
  return { visualKind: 'cloudy', labelKey: 'weather_cloudy' };
};

const roundTemperature = (value: number | null | undefined) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  return Math.round(value);
};

export const formatIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const resolveMatchDateToIso = (dateString: string, reference = new Date()) => {
  const [day, month] = (dateString || '01/01').split('/').map(Number);
  const resolved = new Date(reference);
  resolved.setHours(12, 0, 0, 0);
  const matchMonth = (month || 1) - 1;
  if (matchMonth < resolved.getMonth() - 2) {
    resolved.setFullYear(resolved.getFullYear() + 1);
  }
  resolved.setMonth(matchMonth);
  resolved.setDate(day || 1);
  return formatIsoDate(resolved);
};

export const getWeatherForIsoDate = (forecast: CourtWeatherForecast | null, isoDate: string) => {
  if (!forecast) {
    return { daily: null, hourly: [] as CourtHourlyWeather[] };
  }

  return {
    daily: forecast.daily.find((entry) => entry.date === isoDate) || null,
    hourly: forecast.hourly.filter((entry) => entry.date === isoDate),
  };
};

const getHourDistance = (hourA: string, hourB: string) => {
  const [hoursA, minutesA] = hourA.split(':').map(Number);
  const [hoursB, minutesB] = hourB.split(':').map(Number);
  return Math.abs((hoursA * 60 + minutesA) - (hoursB * 60 + minutesB));
};

export const getHourlyFocusIndex = (entries: CourtHourlyWeather[], selectedHour?: string | null) => {
  if (entries.length === 0) return 0;
  if (!selectedHour) {
    const noonIndex = entries.findIndex((entry) => entry.hour === '12:00');
    return noonIndex >= 0 ? noonIndex : Math.floor(entries.length / 2);
  }

  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;

  entries.forEach((entry, index) => {
    const distance = getHourDistance(entry.hour, selectedHour);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });

  return closestIndex;
};

export const getHourlySliceAround = (entries: CourtHourlyWeather[], selectedHour?: string | null, radius = 3) => {
  if (entries.length === 0) {
    return { entries: [] as CourtHourlyWeather[], selectedIndex: 0 };
  }

  const focusIndex = getHourlyFocusIndex(entries, selectedHour);
  const start = Math.max(0, focusIndex - radius);
  const end = Math.min(entries.length, focusIndex + radius + 1);
  return {
    entries: entries.slice(start, end),
    selectedIndex: focusIndex - start,
  };
};

const normalizeForecast = (payload: OpenMeteoResponse): CourtWeatherForecast => {
  const dailyTime = payload.daily?.time || [];
  const dailyCodes = payload.daily?.weather_code || [];
  const dailyMax = payload.daily?.temperature_2m_max || [];
  const dailyMin = payload.daily?.temperature_2m_min || [];

  const hourlyTime = payload.hourly?.time || [];
  const hourlyCodes = payload.hourly?.weather_code || [];
  const hourlyTemperature = payload.hourly?.temperature_2m || [];
  const hourlyIsDay = payload.hourly?.is_day || [];

  const daily = dailyTime.map((date, index) => {
    const weatherCode = dailyCodes[index] ?? 3;
    const mapped = mapWeatherCode(weatherCode);
    return {
      date,
      weatherCode,
      tempMax: roundTemperature(dailyMax[index]),
      tempMin: roundTemperature(dailyMin[index]),
      ...mapped,
    };
  });

  const hourly = hourlyTime.map((isoTime, index) => {
    const weatherCode = hourlyCodes[index] ?? 3;
    const mapped = mapWeatherCode(weatherCode);
    return {
      isoTime,
      date: isoTime.slice(0, 10),
      hour: isoTime.slice(11, 16),
      temperature: roundTemperature(hourlyTemperature[index]),
      weatherCode,
      isDay: hourlyIsDay[index] !== 0,
      ...mapped,
    };
  });

  return {
    daily,
    hourly,
    fetchedAt: Date.now(),
  };
};

const requestForecast = async () => {
  const response = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${WEATHER_LATITUDE}&longitude=${WEATHER_LONGITUDE}&timezone=${encodeURIComponent(WEATHER_TIMEZONE)}&forecast_days=14&temperature_unit=celsius&daily=weather_code,temperature_2m_max,temperature_2m_min&hourly=temperature_2m,weather_code,is_day`,
  );
  if (!response.ok) {
    throw new Error(`Weather request failed with status ${response.status}`);
  }

  const payload = await response.json() as OpenMeteoResponse;
  return normalizeForecast(payload);
};

export const fetchCourtWeatherForecast = async (force = false) => {
  const now = Date.now();
  if (!force && cache.data && cache.expiresAt > now) {
    return cache.data;
  }

  if (!force && cache.pending) {
    return cache.pending;
  }

  cache.pending = requestForecast()
    .then((data) => {
      cache.data = data;
      cache.expiresAt = Date.now() + WEATHER_CACHE_MS;
      return data;
    })
    .finally(() => {
      cache.pending = null;
    });

  return cache.pending;
};
