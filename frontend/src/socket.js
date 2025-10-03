import { io } from 'socket.io-client';

// Read the URL from the .env file. If it's not found, use a fallback.
const URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

// Export the base URL for HTTP API calls (fetch, axios).
export const API_BASE_URL = URL;

// Create and export the single socket instance for the entire application.
// We are using the name 'socket' consistently across the project.
export const socket = io(URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 5
});
