import * as Localization from 'expo-localization';

export function getDeviceTimeZone() {
  // Returns an IANA string like "America/Chicago"
  return Localization.timezone || 'America/Chicago';
}
