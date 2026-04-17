//server.js
import 'dotenv/config';
import http from 'http';
import { Server as SocketIO } from 'socket.io';
import app from './src/app.js';
import { startCronJobs } from './src/modules/sportmonks/sportmonks.cron.js';
import { registerHomeNamespace, setHomeNamespace } from './src/modules/home/home.ws.js';

const PORT = process.env.PORT || 5000;

console.log("REDIS URL:", process.env.UPSTASH_REDIS_REST_URL);

// Wrap Express in an HTTP server so Socket.io can share the same port
const httpServer = http.createServer(app);

const io = new SocketIO(httpServer, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(",") || ["http://localhost:3000"],
    methods: ["GET", "POST"],
    credentials: true,
  },
  // Allow both websocket and polling transports
  transports: ["websocket", "polling"],
});

// Register the /home namespace
const homeNs = registerHomeNamespace(io);
setHomeNamespace(homeNs);

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT} (HTTP + WebSocket)`);
  startCronJobs();
});
