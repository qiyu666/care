// 客户端逻辑（无需打包）
const socket = io();

const els = {
  nameInput: document.getElementById("nameInput"),
  setNameBtn: document.getElementById("setNameBtn"),
  newGameBtn: document.getElementById("newGameBtn"),
  shuffleBtn: document.getElementById("shuffleBtn"),
  dealBtn: document.getElementById("dealBtn"),
  dealCount: document.getElementById("dealCount"),
  drawBtn: document.getElementById("drawBtn"),
  nextBtn: document.getElementById("nextBtn"),
  shareBtn: document.getElementById("shareBtn"),

  deck: document.getElementById("deck"),
  discard: document.getElementById("discard"),
  deckCount: document.getElementById("deckCount"),
  discardCount: document.getElementById("discardCount"),
  players: document.getElementById("players"),
  status: document.getElementById("status"),
};

let view = {
  you: null,
  seated: false,
  players: [],
  active: 0,
  activeId: null,
  deckCount: 0,
  discardCount: 0,
  discardTop: null,
  canAct: false,
};

function send(type, payload = {}) {
  socket.emit("action", { type, ...payload });
}

socket.on("state", (v) => {
  view = v;
  render();
});

function render() {
  // 控制按钮是否可用
  els.newGameBtn.disabled = !view.canAct;
  els.shuffleBtn.disabled = !view.canAct;
  els.dealBtn.disabled = !view.canAct;
  els.drawBtn.disabled = !view.canAct;
  els.nextBtn.disabled = !view.canAct;

  // 状态条
  const me = view.players.find(p => p.id === view.you);
  const meName = me ? me.name : "观众";
  const turnName = view.players[view.active]?.name || "—";
  const seatInfo = view.seated ? "已入座" : "观战中";
  const actInfo = view.canAct ? "（轮到你行动）" : "";
  els.status.textContent = `状态：${seatInfo} | 你的昵称：${meName} | 当前行动：${turnName} ${actInfo}`;

  // 牌堆/弃牌堆
  els.deck.innerHTML = "";
  els.discard.innerHTML = "";
  // 牌堆厚度效果（最多显示 4 张背面）
  const backs = Math.min(4, view.deckCount);
  for (let i = 0; i < backs; i++) {
    els.deck.appendChild(cardBack());
  }
  if (view.discardTop) {
    els.discard.appendChild(cardFace(view.discardTop));
  }
  els.deckCount.textContent = String(view.deckCount);
  els.discardCount.textContent = String(view.discardCount);

  // 玩家区
  els.players.innerHTML = "";
  view.players.forEach((p, idx) => {
    const box = document.createElement("div");
    box.className = "player";

    const head = document.createElement("div");
    head.className = "head";
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = p.name;

    const badges = document.createElement("div");
    badges.className = "badges";

    if (p.id === view.you) {
      const you = document.createElement("span");
      you.className = "badge you";
      you.textContent = "你";
      badges.appendChild(you);
    }
    const active = document.createElement("span");
    active.className = "badge" + (idx === view.active ? " active" : "");
    active.textContent = (idx === view.active) ? "行动中" : "等待中";
    badges.appendChild(active);

    head.append(name, badges);

    const hand = document.createElement("div");
    hand.className = "hand";
    hand.dataset.playerId = p.id;

    if (p.id === view.you && Array.isArray(p.hand)) {
      // 渲染自己的手牌（可点选出牌，仅当轮到你）
      p.hand.forEach((card, cIdx) => {
        const el = cardFace(card);
        if (view.canAct) {
          el.classList.add("clickable");
          el.dataset.index = String(cIdx);
        }
        hand.appendChild(el);
      });
    } else {
      // 渲染他人的手牌背面
      for (let i = 0; i < p.handCount; i++) {
        hand.appendChild(cardBack());
      }
    }

    box.append(head, hand);
    els.players.appendChild(box);
  });
}

function cardFace(card) {
  const el = document.createElement("div");
  el.className = "card " + (card.color === "red" ? "red" : "");
  el.innerHTML = `
    <div class="corner tl">
      <div class="rank">${card.rank}</div>
      <div class="suit">${card.suit}</div>
    </div>
    <div class="corner br">
      <div class="rank">${card.rank}</div>
      <div class="suit">${card.suit}</div>
    </div>
    <div class="center-suit">${card.suit}</div>
  `;
  return el;
}
function cardBack() {
  const el = document.createElement("div");
  el.className = "card back";
  return el;
}

/* 事件绑定 */
els.setNameBtn.addEventListener("click", () => {
  const v = els.nameInput.value.trim();
  if (v) send("SET_NAME", { name: v });
});

els.newGameBtn.addEventListener("click", () => send("NEW_GAME"));
els.shuffleBtn.addEventListener("click", () => send("SHUFFLE"));
els.dealBtn.addEventListener("click", () => {
  const n = clamp(parseInt(els.dealCount.value || "5", 10) || 5, 0, 10);
  send("DEAL", { count: n });
});
els.drawBtn.addEventListener("click", () => send("DRAW"));
els.nextBtn.addEventListener("click", () => send("NEXT"));

els.deck.addEventListener("click", () => {
  if (view.canAct) send("DRAW");
});

els.players.addEventListener("click", (e) => {
  const card = e.target.closest(".card.clickable");
  if (!card) return;
  const idx = parseInt(card.dataset.index || "-1", 10);
  if (!Number.isNaN(idx) && view.canAct) {
    send("PLAY", { index: idx });
  }
});

els.shareBtn.addEventListener("click", async () => {
  const url = location.href;
  try {
    await navigator.clipboard.writeText(url);
    toast("链接已复制，可以发给朋友啦～");
  } catch {
    prompt("复制下面这个链接发给朋友：", url);
  }
});

function toast(msg) {
  els.status.textContent = `状态：${msg}`;
  setTimeout(() => render(), 1500);
}

function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }

// 初始提示
els.status.textContent = "状态：已连接。可设置昵称，等待或开始一局。";