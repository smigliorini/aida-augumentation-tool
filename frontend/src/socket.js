import { io } from 'socket.io-client';

// URL del tuo server backend
const URL = 'http://localhost:5000';

// Crea l'istanza del socket UNA SOLA VOLTA e la esporta.
// `autoConnect: false` impedisce la connessione automatica all'avvio dell'app.
// La connessione verrà gestita manualmente dai componenti.
export const socket = io(URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 5
});