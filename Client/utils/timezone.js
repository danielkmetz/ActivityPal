import * as Localization from "expo-localization";

export function getDeviceTimeZone() {
  const tz = typeof Localization.timezone === "string" ? Localization.timezone.trim() : "";
  return tz || null;
}

// minutes to add to UTC to get local time (CST winter = -360)
export function getDeviceTzOffsetMinutes() {
  return -new Date().getTimezoneOffset();
}
