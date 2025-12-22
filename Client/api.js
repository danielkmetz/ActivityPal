import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";

let cachedToken = null;
let tokenLoaded = false;

export async function primeAuthToken() {
  if (tokenLoaded) return cachedToken;
  cachedToken = await AsyncStorage.getItem("token");
  tokenLoaded = true;
  return cachedToken;
}

export function setAuthToken(token) {
  cachedToken = token || null;
  tokenLoaded = true;
}

const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_BASE_URL, // SHOULD be ".../api"
  timeout: 15000,
});

api.interceptors.request.use(async (config) => {
  try {
    if (!tokenLoaded) await primeAuthToken();
    if (cachedToken) config.headers.Authorization = `Bearer ${cachedToken}`;
  } catch {
    // do nothing
  }
  return config;
});

export default api;
