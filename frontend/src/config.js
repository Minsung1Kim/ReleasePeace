export const API_BASE_URL = import.meta.env.VITE_API_URL || 'YOUR_ACTUAL_RAILWAY_URL_HERE';

export const config = {
  apiUrl: API_BASE_URL,
  version: '1.0.0',
  environment: import.meta.env.MODE
};