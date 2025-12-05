const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static('public')); // جميع الملفات في مجلد public

// هياكل الغرف
const rooms = {};

io.on('connection', (socket) => {
  console.log('player connected:', socket.id);

  socket.on('createRoom', ({ roomId, playerId, name, color }) => {
    rooms[roomId] = { players: [{ id: playerId, name, color, isHost: true }] };
    socket.join(roomId);
    io.to(roomId).emit('updatePlayers', { roomId, players: rooms[roomId].players });
  });

  socket.on('joinRoom', ({ roomId, playerId, name, color }) => {
    if (!rooms[roomId]) return socket.emit('error', 'الغرفة غير موجودة');
    rooms[roomId].players.push({ id: playerId, name, color, isHost: false });
    socket.join(roomId);
    io.to(roomId).emit('updatePlayers', { roomId, players: rooms[roomId].players });
  });

  socket.on('leaveRoom', ({ roomId, playerId }) => {
    if (!rooms[roomId]) return;
    rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== playerId);
    socket.leave(roomId);
    if (rooms[roomId].players.length === 0) delete rooms[roomId];
    else io.to(roomId).emit('updatePlayers', { roomId, players: rooms[roomId].players });
  });

  socket.on('startGame', ({ roomId }) => {
    if (!rooms[roomId]) return;
    io.to(roomId).emit('gameStarted', { roomId, players: rooms[roomId].players });
  });

  socket.on('playerAction', ({ roomId, playerId, action }) => {
    if (!rooms[roomId]) return;
    io.to(roomId).emit('playerAction', { playerId, action });
  });

  socket.on('disconnect', () => {
    console.log('player disconnected:', socket.id);
    // تنظيف تلقائي إذا أردت لاحقًا
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
