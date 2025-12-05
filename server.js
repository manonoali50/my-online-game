const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve index.html and other files directly from root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/:file", (req, res) => {
  res.sendFile(path.join(__dirname, req.params.file));
});

// --------------------
// Socket.io multiplayer
// --------------------
const rooms = {}; // roomId => { players: {}, actions: [], hostId }

io.on("connection", (socket) => {
  console.log("New socket connected:", socket.id);

  socket.on("create_room", (data) => {
    const { nickname } = data;
    const roomId = Math.random().toString(36).substring(2, 8);
    rooms[roomId] = {
      players: {},
      actions: [],
      hostId: socket.id
    };
    rooms[roomId].players[socket.id] = { id: socket.id, name: nickname, color: randomColor() };
    socket.join(roomId);
    socket.emit("room_created", { roomId, players: rooms[roomId].players });
    io.to(roomId).emit("update_players", rooms[roomId].players);
  });

  socket.on("join_room", (data) => {
    const { nickname, roomId } = data;
    if (!rooms[roomId]) {
      socket.emit("error_msg", "Room not found");
      return;
    }
    if (Object.keys(rooms[roomId].players).length >= 4) {
      socket.emit("error_msg", "Room full");
      return;
    }
    rooms[roomId].players[socket.id] = { id: socket.id, name: nickname, color: randomColor() };
    socket.join(roomId);
    io.to(roomId).emit("update_players", rooms[roomId].players);
    socket.emit("joined_room", { roomId, players: rooms[roomId].players, host: rooms[roomId].hostId === socket.id });
  });

  socket.on("start_game", (data) => {
    const { roomId } = data;
    if (!rooms[roomId] || rooms[roomId].hostId !== socket.id) return;
    io.to(roomId).emit("multiplayer_start", { players: Object.values(rooms[roomId].players), host: true });
  });

  socket.on("action", (data) => {
    const { roomId, action } = data;
    if (!rooms[roomId]) return;
    rooms[roomId].actions.push({ from: socket.id, action });
    socket.to(roomId).emit("multiplayer_action", action);
  });

  socket.on("disconnect", () => {
    // Remove player from any rooms
    for (const roomId in rooms) {
      const room = rooms[roomId];
      if (room.players[socket.id]) {
        delete room.players[socket.id];
        io.to(roomId).emit("update_players", room.players);
        // If host left, assign new host
        if (room.hostId === socket.id) {
          const keys = Object.keys(room.players);
          room.hostId = keys[0] || null;
          io.to(roomId).emit("host_update", room.hostId);
        }
        // Delete room if empty
        if (Object.keys(room.players).length === 0) {
          delete rooms[roomId];
        }
      }
    }
  });
});

function randomColor() {
  const colors = ['#e53935','#8e24aa','#3949ab','#00897b','#f4511e','#fb8c00','#43a047','#1e88e5'];
  return colors[Math.floor(Math.random() * colors.length)];
}

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
