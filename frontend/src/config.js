// frontend/src/config.js
export const config = {
  // Backend origin (no trailing slash). We append "/api/..." in api.js
  apiUrl: import.meta.env.VITE_API_BASE || "https://releasepeace-production.up.railway.app",
};