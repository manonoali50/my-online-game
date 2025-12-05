const socket = io();

let room = null;
let isHost = false;

const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const startGameBtn = document.getElementById('startGameBtn');
const nicknameInput = document.getElementById('nicknameInput');
const roomIdInput = document.getElementById('roomIdInput');
const playersList = document.getElementById('playersList');

window.multiplayer = {
  send(action){
    if(room){
      socket.emit('action',{ roomId:room, data:action });
    }
  }
};

createRoomBtn.onclick = ()=>{
  const name = nicknameInput.value || "Player";
  socket.emit('createRoom',{ name }, res=>{
    room = res.roomId;
    roomIdInput.value = room;
    isHost = true;
    renderPlayers(res.players);
  });
};

joinRoomBtn.onclick = ()=>{
  socket.emit('joinRoom',{
    name: nicknameInput.value || "Player",
    roomId: roomIdInput.value
  }, res=>{
    if(res.error) return alert(res.error);
    room = res.roomId;
    isHost = false;
    renderPlayers(res.players);
  });
};

startGameBtn.onclick = ()=>{
  if(isHost){
    socket.emit('startGame',{ roomId:room });
  }
};

socket.on('updatePlayers', players=>{
  renderPlayers(players);
  isHost = players[0]?.id === socket.id;
});

socket.on('gameStarted', players=>{
  window.dispatchEvent(new CustomEvent('multiplayer_start',{
    detail:{ players, host:isHost }
  }));
});

socket.on('action', data=>{
  window.dispatchEvent(new CustomEvent('multiplayer_action',{ detail:data }));
});

function renderPlayers(players){
  playersList.innerHTML = "";
  players.forEach((p,i)=>{
    const div = document.createElement("div");
    div.style.padding = "6px";
    div.style.background = "#222";
    div.style.margin = "4px";
    div.innerHTML = `<span style="color:${p.color}">●</span> ${p.name} ${i==0?"(Host)":""}`;
    playersList.appendChild(div);
  });
}
