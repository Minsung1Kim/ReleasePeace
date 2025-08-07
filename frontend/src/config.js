const BACKEND_URL = 'https://releasepeace-production.up.railway.app';

export const API_BASE_URL = import.meta.env.VITE_API_URL || BACKEND_URL;

export const config = {
  apiUrl: API_BASE_URL,
  version: '1.0.0',
  environment: import.meta.env.MODE
};

if (import.meta.env.MODE === 'development') {
  console.log('🔧 API Configuration:', {
    apiUrl: API_BASE_URL,
    environment: import.meta.env.MODE,
    viteApiUrl: import.meta.env.VITE_API_URL
  });
}