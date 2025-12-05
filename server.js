const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static('public')); // افترض ملفاتك في مجلد public

// هياكل الغرف
const rooms = {};

io.on('connection', (socket) => {
  console.log('player connected:', socket.id);

  // إنشاء غرفة
  socket.on('createRoom', ({ roomId, playerId, name, color }) => {
    rooms[roomId] = {
      players: [{ id: playerId, name, color, isHost: true }],
      gameStarted: false
    };
    socket.join(roomId);
    io.to(roomId).emit('updatePlayers', { roomId, players: rooms[roomId].players });
    console.log(`غرفة تم إنشاؤها: ${roomId} بواسطة ${name}`);
  });

  // الانضمام لغرفة
  socket.on('joinRoom', ({ roomId, playerId, name, color }) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('error', 'الغرفة غير موجودة');
    if (room.gameStarted) return socket.emit('error', 'اللعبة بدأت بالفعل');
    room.players.push({ id: playerId, name, color, isHost: false });
    socket.join(roomId);
    io.to(roomId).emit('updatePlayers', { roomId, players: room.players });
    console.log(`${name} انضم للغرفة: ${roomId}`);
  });

  // مغادرة الغرفة
  socket.on('leaveRoom', ({ roomId, playerId }) => {
    const room = rooms[roomId];
    if (!room) return;
    room.players = room.players.filter(p => p.id !== playerId);
    socket.leave(roomId);
    if (room.players.length === 0) {
      delete rooms[roomId];
      console.log(`تم حذف الغرفة: ${roomId} (خالية)`);
    } else {
      // إذا خرج الهوست، اجعل أول لاعب آخر هو الهوست
      if (!room.players.some(p => p.isHost)) room.players[0].isHost = true;
      io.to(roomId).emit('updatePlayers', { roomId, players: room.players });
    }
  });

  // بدء اللعبة (فقط الهوست)
  socket.on('startGame', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.gameStarted) return;
    const host = room.players.find(p => p.isHost);
    if (!host) return;

    room.gameStarted = true;
    io.to(roomId).emit('gameStarted', { roomId, players: room.players });
    console.log(`اللعبة بدأت في الغرفة: ${roomId}`);
  });

  // استقبال حركة لاعب وإرسالها للجميع في الغرفة
  socket.on('playerAction', ({ roomId, playerId, action }) => {
    const room = rooms[roomId];
    if (!room) return;
    io.to(roomId).emit('playerAction', { playerId, action });
  });

  // قطع الاتصال
  socket.on('disconnect', () => {
    console.log('player disconnected:', socket.id);
    // اختياري: تنظيف الغرف إذا أردت (يمكن تطويره لاحقاً)
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
