import axios from 'axios';
import { getUserToken } from './functions';

const api = axios.create({
  baseURL: '/',                 // change if you need absolute URL
  withCredentials: true,        // include cookies/session
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  const token = await getUserToken();          // e.g., from SecureStore/AsyncStorage
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;