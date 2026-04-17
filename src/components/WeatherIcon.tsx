import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { WeatherVisualKind } from '../services/weather';

type WeatherIconProps = {
  kind: WeatherVisualKind;
  isDay?: boolean;
  size?: number;
  color?: string;
};

export default function WeatherIcon({ kind, isDay = true, size = 20, color = '#f8fafc' }: WeatherIconProps) {
  let iconName: keyof typeof Ionicons.glyphMap = 'cloud-outline';

  switch (kind) {
    case 'clear':
      iconName = isDay ? 'sunny-outline' : 'moon-outline';
      break;
    case 'mostlyClear':
    case 'partlyCloudy':
      iconName = isDay ? 'partly-sunny-outline' : 'moon-outline';
      break;
    case 'cloudy':
      iconName = 'cloud-outline';
      break;
    case 'fog':
      iconName = 'cloudy-outline';
      break;
    case 'drizzle':
    case 'rain':
    case 'showers':
      iconName = 'rainy-outline';
      break;
    case 'snow':
      iconName = 'snow-outline';
      break;
    case 'storm':
      iconName = 'thunderstorm-outline';
      break;
    default:
      iconName = 'cloud-outline';
  }

  return <Ionicons name={iconName} size={size} color={color} />;
}
