const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {};

function genRoomId(){
  return Math.random().toString(36).substring(2,8).toUpperCase();
}

function genUniqueColor(used){
  let c;
  do{
    c = '#' + Math.floor(Math.random()*16777215).toString(16);
  } while(used.includes(c));
  return c;
}

io.on('connection', socket => {

  socket.on('createRoom', ({ name }, cb)=>{
    const roomId = genRoomId();
    const color = genUniqueColor([]);
    rooms[roomId] = {
      host: socket.id,
      players:[{ id: socket.id, name, color }]
    };
    socket.join(roomId);
    cb({ roomId, players: rooms[roomId].players, host:true });
    io.to(roomId).emit('updatePlayers', rooms[roomId].players);
  });

  socket.on('joinRoom', ({ name, roomId }, cb)=>{
    if(!rooms[roomId]) return cb({ error:'الغرفة غير موجودة' });

    const used = rooms[roomId].players.map(p=>p.color);
    const color = genUniqueColor(used);

    rooms[roomId].players.push({ id: socket.id, name, color });
    socket.join(roomId);

    cb({ roomId, players: rooms[roomId].players, host:false });
    io.to(roomId).emit('updatePlayers', rooms[roomId].players);
  });

  socket.on('startGame', ({ roomId })=>{
    if(!rooms[roomId]) return;
    if(rooms[roomId].host !== socket.id) return;

    io.to(roomId).emit('gameStarted', rooms[roomId].players);
  });

  socket.on('action', ({ roomId, data })=>{
    socket.to(roomId).emit('action', data);
  });

  socket.on('disconnect', ()=>{
    for(const r in rooms){
      rooms[r].players = rooms[r].players.filter(p=>p.id!==socket.id);
      if(rooms[r].players.length===0) delete rooms[r];
      else io.to(r).emit('updatePlayers', rooms[r].players);
    }
  });

});

server.listen(process.env.PORT || 3000);
