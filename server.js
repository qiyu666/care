// 简单多人在线扑克牌服务器(一桌)
// 运行：node server.js
const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const MAX_PLAYERS = 6;
const suits = ["♠", "♥", "♦", "♣"];
const ranks = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];

function newDeck() {
  const deck = [];
  for (const s of suits) for (const r of ranks) {
    deck.push({
      id: `${s}-${r}-${Math.random().toString(36).slice(2,8)}`,
      suit: s, rank: r,
      color: (s === "♥" || s === "♦") ? "red" : "black"
    });
  }
  return deck;
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }

let state = {
  players: [],      // [{id, name, hand: Card[]}]
  deck: shuffle(newDeck()),
  discard: [],
  active: 0,        // index in players
};

function ensureDeckRefill() {
  if (state.deck.length === 0 && state.discard.length > 1) {
    const top = state.discard.pop();
    state.deck = shuffle([...state.discard]);
    state.discard = [top];
  }
}

function viewFor(viewerId) {
  const activePlayer = state.players[state.active];
  const activeId = activePlayer ? activePlayer.id : null;
  const seated = state.players.some(p => p.id === viewerId);
  return {
    you: viewerId,
    seated,
    players: state.players.map(p => ({
      id: p.id,
      name: p.name,
      handCount: p.hand.length,
      hand: p.id === viewerId ? p.hand : undefined
    })),
    active: state.active,
    activeId,
    deckCount: state.deck.length,
    discardCount: state.discard.length,
    discardTop: state.discard[state.discard.length - 1] || null,
    canAct: seated && activeId === viewerId,
  };
}

function broadcastAll() {
  for (const [id, s] of io.sockets.sockets) {
    s.emit("state", viewFor(id));
  }
}

io.on("connection", (socket) => {
  // 入座或观战
  if (state.players.length < MAX_PLAYERS) {
    const p = { id: socket.id, name: `玩家 ${state.players.length + 1}`, hand: [] };
    state.players.push(p);
    if (state.players.length === 1) state.active = 0; // 首位玩家成为先手
  } else {
    // 观众，不入座
  }
  socket.emit("state", viewFor(socket.id));
  broadcastAll();

  socket.on("action", (action) => {
    const actorId = socket.id;
    const actorIndex = state.players.findIndex(p => p.id === actorId);
    const isSeated = actorIndex !== -1;
    const isActive = isSeated && state.players[state.active]?.id === actorId;

    switch (action.type) {
      case "SET_NAME": {
        if (!isSeated) break;
        const name = String(action.name || "").slice(0, 24).trim();
        if (name) state.players[actorIndex].name = name;
        break;
      }

      case "NEW_GAME": {
        if (!isActive && state.players.length > 0) break;
        // 回收所有手牌，重置牌堆与弃牌堆
        for (const p of state.players) {
          state.deck.push(...p.hand);
          p.hand.length = 0;
        }
        shuffle(state.deck);
        state.discard = [];
        state.active = 0;
        break;
      }

      case "SHUFFLE": {
        if (!isActive) break;
        shuffle(state.deck);
        break;
      }

      case "DEAL": {
        if (!isActive) break;
        const count = clamp(parseInt(action.count ?? 1, 10) || 1, 0, 10);
        if (count <= 0 || state.players.length === 0) break;
        for (let c = 0; c < count; c++) {
          for (let i = 0; i < state.players.length; i++) {
            ensureDeckRefill();
            if (state.deck.length === 0) break;
            state.players[i].hand.push(state.deck.pop());
          }
        }
        break;
      }

      case "DRAW": {
        if (!isActive) break;
        ensureDeckRefill();
        if (state.deck.length > 0) {
          state.players[actorIndex].hand.push(state.deck.pop());
        }
        break;
      }

      case "PLAY": {
        if (!isActive) break;
        const idx = clamp(parseInt(action.index ?? -1, 10), -1, 999);
        const hand = state.players[actorIndex].hand;
        if (idx >= 0 && idx < hand.length) {
          const [card] = hand.splice(idx, 1);
          state.discard.push(card);
        }
        break;
      }

      case "NEXT": {
        if (!isActive) break;
        if (state.players.length > 0) {
          state.active = (state.active + 1) % state.players.length;
        }
        break;
      }
    }

    broadcastAll();
  });

  socket.on("disconnect", () => {
    const idx = state.players.findIndex(p => p.id === socket.id);
    if (idx !== -1) {
      // 回收该玩家手牌到牌堆，洗牌
      state.deck.push(...state.players[idx].hand);
      state.players.splice(idx, 1);
      shuffle(state.deck);
      // 修正 active 指针
      if (state.players.length === 0) {
        state.active = 0;
      } else {
        if (idx < state.active) state.active--;
        if (state.active >= state.players.length) state.active = 0;
      }
      broadcastAll();
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`服务器已启动: http://localhost:${PORT}`);
});