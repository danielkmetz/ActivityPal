import axios from 'axios';

const api = axios.create({
  baseURL: '/',
  withCredentials: true,                      // only matters if you ALSO use cookies
  headers: { 'Content-Type': 'application/json' },
});

export default api;
