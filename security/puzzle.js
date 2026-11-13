//puzzle.js
let CELL_SIZE = 42;
const GAP_SIZE = 3;
let STEP = CELL_SIZE + GAP_SIZE;
const BOARD_ROWS = 5;
const BOARD_COLS = 5;
let TRAY_SCALE = 0.6;

const targetUrl = String.fromCharCode(104,116,116,112,115,58,47,47,100,111,99,115,46,103,111,111,103,108,101,46,99,111,109,47,102,111,114,109,115,47,100,47,101,47,49,70,65,73,112,81,76,83,99,107,114,117,121,106,104,68,122,110,120,112,73,85,122,84,50,83,85,65,68,116,115,120,77,57,79,84,99,109,82,54,56,84,108,95,73,113,111,50,65,72,110,69,66,78,56,119,47,118,105,101,119,102,111,114,109);

const displayUrl = "https://docs.google.com/spreadsheets/d/1OXCxszi_UR4tgxr9Mtv04KcWD6AcIHY7MVECnk9sYu4/edit?gid=61667610#gid=61667610";

const ubongoStageEl = document.getElementById('ubongo-stage');
const boardOuter = document.getElementById('board-outer');
const boardGrid = document.getElementById('board-grid');
const tray = document.getElementById('tray');
const btnRotate = document.getElementById('btn-rotate');
const btnFlip = document.getElementById('btn-flip');

let boardState = Array(BOARD_ROWS).fill(null).map(() => Array(BOARD_COLS).fill(null));
let selectedPiece = null;
let isCleared = false;
let pieceInstances = [];

const piecesData = [
  { id: 'p1',  colorClass: 'p1',  shape: [[1,1,1,1,1]] },             // I
  { id: 'p2',  colorClass: 'p2',  shape: [[1,0],[1,0],[1,0],[1,1]] },  // L
  { id: 'p3',  colorClass: 'p3',  shape: [[1,1],[1,1],[1,0]] },       // P
  { id: 'p4',  colorClass: 'p4',  shape: [[0,1],[1,1],[1,0],[1,0]] },  // N
  { id: 'p5',  colorClass: 'p5',  shape: [[0,1],[1,1],[0,1],[0,1]] },  // Y
  { id: 'p6',  colorClass: 'p6',  shape: [[1,1,1],[0,1,0],[0,1,0]] },  // T
  { id: 'p7',  colorClass: 'p7',  shape: [[0,1,1],[1,1,0],[0,1,0]] },  // F
  { id: 'p8',  colorClass: 'p8',  shape: [[1,0,0],[1,0,0],[1,1,1]] },  // V
  { id: 'p9',  colorClass: 'p9',  shape: [[1,0,0],[1,1,0],[0,1,1]] },  // W
  { id: 'p10', colorClass: 'p10', shape: [[1,1,0],[0,1,0],[0,1,1]] },  // Z
  { id: 'p11', colorClass: 'p11', shape: [[1,0,1],[1,1,1]] },          // U
  { id: 'p12', colorClass: 'p12', shape: [[0,1,0],[1,1,1],[0,1,0]] }   // X
];

function updateLayoutMetrics() {
  const isMobile = window.innerWidth <= 920;

  if (!isMobile) {
    CELL_SIZE = 42;
    STEP = CELL_SIZE + GAP_SIZE;
    TRAY_SCALE = 0.6;

    tray.style.width = '550px';
    tray.style.height = '365px';

    const cols = 4;
    const rows = 3;
    const colWidth = 550 / cols;
    const rowHeight = 365 / rows;

    piecesData.forEach((data, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      data.initX = c * colWidth + 10;
      data.initY = r * rowHeight + 10;
    });
  } else {
    tray.style.width = '100%';
    const trayWidth = tray.clientWidth || Math.max(280, window.innerWidth - 36);

    CELL_SIZE = Math.min(44, Math.max(36, Math.floor((trayWidth - 20) / 5) - GAP_SIZE));
    STEP = CELL_SIZE + GAP_SIZE;

    const cols = 3;
    const rows = 4;
    const colWidth = trayWidth / cols;
    const maxPieceFullWidth = 5 * CELL_SIZE + 4 * GAP_SIZE;

    TRAY_SCALE = Math.min(0.55, Math.max(0.32, (colWidth - 10) / maxPieceFullWidth));
    const rowHeight = Math.max(66, Math.ceil((3 * CELL_SIZE + 2 * GAP_SIZE) * TRAY_SCALE + 18));
    const trayHeight = rowHeight * rows + 8;

    tray.style.height = `${trayHeight}px`;

    piecesData.forEach((data, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      data.initX = c * colWidth + 8;
      data.initY = r * rowHeight + 8;
    });
  }

  const boardInnerSize = CELL_SIZE * BOARD_COLS + GAP_SIZE * (BOARD_COLS - 1);
  const boardOuterSize = boardInnerSize + 12;
  boardOuter.style.width = `${boardOuterSize}px`;
  boardOuter.style.height = `${boardOuterSize}px`;
  boardGrid.style.gridTemplateColumns = `repeat(5, ${CELL_SIZE}px)`;
  boardGrid.style.gridTemplateRows = `repeat(5, ${CELL_SIZE}px)`;

  document.querySelectorAll('.cell').forEach(cell => {
    cell.style.width = `${CELL_SIZE}px`;
    cell.style.height = `${CELL_SIZE}px`;
  });

  const boardRect = boardOuter.getBoundingClientRect();
  const trayRect = tray.getBoundingClientRect();

  pieceInstances.forEach((p, i) => {
    p.initX = piecesData[i].initX;
    p.initY = piecesData[i].initY;
    p.render();

    if (p.placedR !== null) {
      const snapLeft = (boardRect.left + 6 + p.placedC * STEP) - trayRect.left;
      const snapTop = (boardRect.top + 6 + p.placedR * STEP) - trayRect.top;
      p.element.style.left = `${snapLeft}px`;
      p.element.style.top = `${snapTop}px`;
    } else {
      p.updateScale(TRAY_SCALE);
      p.element.style.left = `${p.initX}px`;
      p.element.style.top = `${p.initY}px`;
    }
  });
}

window.addEventListener('resize', () => {
  if (ubongoStageEl.style.display === 'block') {
    updateLayoutMetrics();
  }
});

function selectPiece(piece) {
  if (isCleared) return;
  if (selectedPiece && selectedPiece !== piece) {
    selectedPiece.element.classList.remove('selected');
  }
  selectedPiece = piece;
  if (selectedPiece) {
    selectedPiece.element.classList.add('selected');
    btnRotate.disabled = false;
    btnFlip.disabled = false;
  } else {
    btnRotate.disabled = true;
    btnFlip.disabled = true;
  }
}

btnRotate.addEventListener('click', (e) => {
  e.stopPropagation();
  if (selectedPiece && !isCleared) {
    selectedPiece.rotate();
  }
});

btnFlip.addEventListener('click', (e) => {
  e.stopPropagation();
  if (selectedPiece && !isCleared) {
    selectedPiece.flip();
  }
});

function getOrientations(shape) {
  const orientations = [];
  let curr = shape;
  for (let i = 0; i < 4; i++) {
    const rLen = curr.length;
    const cLen = curr[0].length;
    const rot = Array(cLen).fill(null).map((_, c) =>
      Array(rLen).fill(null).map((__, r) => curr[rLen - 1 - r][c])
    );
    const flipped = curr.map(row => [...row].reverse());
    [curr, flipped].forEach(cand => {
      const str = JSON.stringify(cand);
      if (!orientations.some(o => JSON.stringify(o) === str)) {
        orientations.push(cand);
      }
    });
    curr = rot;
  }
  return orientations;
}

const allOrientations = {};
piecesData.forEach(p => {
  allOrientations[p.id] = getOrientations(p.shape);
});

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateSolvableBoard() {
  for (let attempt = 0; attempt < 50; attempt++) {
    const chosen = shuffleArray(piecesData).slice(0, 4);
    const simBoard = Array(BOARD_ROWS).fill(null).map(() => Array(BOARD_COLS).fill(null));

    const canSimPlace = (shape, r, c) => {
      if (r + shape.length > BOARD_ROWS || c + shape[0].length > BOARD_COLS) return false;
      for (let dr = 0; dr < shape.length; dr++) {
        for (let dc = 0; dc < shape[0].length; dc++) {
          if (shape[dr][dc] === 1 && simBoard[r + dr][c + dc] !== null) return false;
        }
      }
      return true;
    };

    const simPlace = (shape, r, c, val) => {
      for (let dr = 0; dr < shape.length; dr++) {
        for (let dc = 0; dc < shape[0].length; dc++) {
          if (shape[dr][dc] === 1) simBoard[r + dr][c + dc] = val;
        }
      }
    };

    const backtrack = (idx) => {
      if (idx === 4) return true;
      const pid = chosen[idx].id;
      const orients = shuffleArray(allOrientations[pid]);
      const positions = [];
      for (let r = 0; r < BOARD_ROWS; r++) {
        for (let c = 0; c < BOARD_COLS; c++) {
          positions.push([r, c]);
        }
      }
      const shuffledPos = shuffleArray(positions);

      for (const shape of orients) {
        for (const [r, c] of shuffledPos) {
          if (canSimPlace(shape, r, c)) {
            simPlace(shape, r, c, pid);
            if (backtrack(idx + 1)) return true;
            simPlace(shape, r, c, null);
          }
        }
      }
      return false;
    };

    if (backtrack(0)) {
      const blockedSet = new Set();
      for (let r = 0; r < BOARD_ROWS; r++) {
        for (let c = 0; c < BOARD_COLS; c++) {
          if (simBoard[r][c] === null) {
            blockedSet.add(`${r},${c}`);
          }
        }
      }
      return blockedSet;
    }
  }
  return new Set(['0,4', '1,4', '2,4', '3,4', '4,4']);
}

function initPuzzle() {
  isCleared = false;
  selectPiece(null);
  document.querySelectorAll('.piece').forEach(el => el.remove());
  pieceInstances = [];

  updateLayoutMetrics();

  const blockedSet = generateSolvableBoard();

  boardGrid.innerHTML = '';
  boardState = Array(BOARD_ROWS).fill(null).map(() => Array(BOARD_COLS).fill(null));

  for (let r = 0; r < BOARD_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.style.width = `${CELL_SIZE}px`;
      cell.style.height = `${CELL_SIZE}px`;
      if (blockedSet.has(`${r},${c}`)) {
        cell.classList.add('blocked');
        boardState[r][c] = 'BLOCKED';
      } else {
        cell.addEventListener('click', () => {
          if (!selectedPiece || isCleared) return;
          tryTapPlace(selectedPiece, r, c);
        });
      }
      boardGrid.appendChild(cell);
    }
  }

  piecesData.forEach(data => {
    const p = new Piece(data);
    pieceInstances.push(p);
  });
}

function tryTapPlace(piece, tapR, tapC) {
  const wasPlaced = piece.placedR !== null;
  const oldR = piece.placedR;
  const oldC = piece.placedC;
  if (wasPlaced) piece.removeFromBoard();

  const h = piece.shape.length;
  const w = piece.shape[0].length;
  const candidates = [
    [tapR, tapC],
    [tapR - Math.floor(h / 2), tapC - Math.floor(w / 2)],
    [tapR - (h - 1), tapC],
    [tapR, tapC - (w - 1)],
    [tapR - (h - 1), tapC - (w - 1)]
  ];

  for (const [candR, candC] of candidates) {
    if (piece.canPlace(candR, candC)) {
      piece.placeOnBoard(candR, candC, boardOuter.getBoundingClientRect(), tray.getBoundingClientRect());
      checkClear();
      return;
    }
  }

  if (wasPlaced) {
    piece.placeOnBoard(oldR, oldC, boardOuter.getBoundingClientRect(), tray.getBoundingClientRect());
  }
}

class Piece {
  constructor(data) {
    this.id = data.id;
    this.colorClass = data.colorClass;
    this.shape = data.shape;
    this.initX = data.initX;
    this.initY = data.initY;

    this.placedR = null;
    this.placedC = null;
    this.currentScale = TRAY_SCALE;

    this.element = document.createElement('div');
    this.element.className = `piece ${this.colorClass}`;
    tray.appendChild(this.element);

    this.render();
    this.resetPosition();
    this.initDrag();
  }

  render() {
    this.element.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'piece-grid';
    grid.style.gridTemplateRows = `repeat(${this.shape.length}, ${CELL_SIZE}px)`;
    grid.style.gridTemplateColumns = `repeat(${this.shape[0].length}, ${CELL_SIZE}px)`;

    for (let r = 0; r < this.shape.length; r++) {
      for (let c = 0; c < this.shape[0].length; c++) {
        const block = document.createElement('div');
        block.style.width = `${CELL_SIZE}px`;
        block.style.height = `${CELL_SIZE}px`;
        if (this.shape[r][c] === 1) {
          block.className = 'block';
        } else {
          block.style.visibility = 'hidden';
        }
        grid.appendChild(block);
      }
    }
    this.element.appendChild(grid);
    this.updateScale(this.currentScale);
  }

  updateScale(scale) {
    this.currentScale = scale;
    this.element.style.transform = `scale(${scale})`;
  }

  rotate() {
    if (this.placedR !== null) this.removeFromBoard();

    const rows = this.shape.length;
    const cols = this.shape[0].length;
    let rotated = Array(cols).fill(null).map(() => Array(rows).fill(0));

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        rotated[c][rows - 1 - r] = this.shape[r][c];
      }
    }
    this.shape = rotated;
    this.render();
    this.resetPosition();
  }

  flip() {
    if (this.placedR !== null) this.removeFromBoard();

    this.shape = this.shape.map(row => [...row].reverse());
    this.render();
    this.resetPosition();
  }

  resetPosition() {
    this.removeFromBoard();
    this.updateScale(TRAY_SCALE);
    this.element.style.left = `${this.initX}px`;
    this.element.style.top = `${this.initY}px`;
  }

  initDrag() {
    let isDragging = false;
    let startPointerX, startPointerY;
    let grabOffsetRatioX = 0.5, grabOffsetRatioY = 0.5;
    let hasDragged = false;
    let wasAlreadySelected = false;

    this.element.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (isCleared) return;
      selectPiece(this);
      this.flip();
    });

    this.element.addEventListener('pointerdown', (e) => {
      if (e.button === 2 || isCleared) return;

      wasAlreadySelected = (selectedPiece === this);
      selectPiece(this);

      isDragging = true;
      hasDragged = false;
      startPointerX = e.clientX;
      startPointerY = e.clientY;

      const rect = this.element.getBoundingClientRect();

      grabOffsetRatioX = (e.clientX - rect.left) / rect.width;
      grabOffsetRatioY = (e.clientY - rect.top) / rect.height;

      this.element.setPointerCapture(e.pointerId);
    });

    this.element.addEventListener('pointermove', (e) => {
      if (!isDragging || isCleared) return;

      const dx = e.clientX - startPointerX;
      const dy = e.clientY - startPointerY;

      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
        if (!hasDragged) {
          hasDragged = true;
          if (this.placedR !== null) {
            this.removeFromBoard();
          }
        }
      }

      if (!hasDragged) return;

      const boardRect = boardOuter.getBoundingClientRect();
      const trayRect = tray.getBoundingClientRect();

      const touchLift = (e.pointerType === 'touch') ? 45 : 0;
      const effectiveY = e.clientY - touchLift;

      const isOverBoard = (
        e.clientX >= boardRect.left - 15 && e.clientX <= boardRect.right + 15 &&
        effectiveY >= boardRect.top - 15 && effectiveY <= boardRect.bottom + 15
      );

      const targetScale = isOverBoard ? 1.0 : TRAY_SCALE;
      this.updateScale(targetScale);

      const pieceWidth = (this.shape[0].length * CELL_SIZE + (this.shape[0].length - 1) * GAP_SIZE) * targetScale;
      const pieceHeight = (this.shape.length * CELL_SIZE + (this.shape.length - 1) * GAP_SIZE) * targetScale;

      const posX = (e.clientX - trayRect.left) - (grabOffsetRatioX * pieceWidth);
      const posY = (effectiveY - trayRect.top) - (grabOffsetRatioY * pieceHeight);

      this.element.style.left = `${posX}px`;
      this.element.style.top = `${posY}px`;
    });

    this.element.addEventListener('pointerup', (e) => {
      if (!isDragging) return;
      isDragging = false;
      this.element.releasePointerCapture(e.pointerId);

      if (isCleared) return;

      if (!hasDragged && e.button === 0) {
        if (wasAlreadySelected) {
          this.rotate();
        }
        return;
      }

      const boardRect = boardOuter.getBoundingClientRect();
      const pieceRect = this.element.getBoundingClientRect();

      const relX = pieceRect.left - (boardRect.left + 6);
      const relY = pieceRect.top - (boardRect.top + 6);

      const targetC = Math.round(relX / STEP);
      const targetR = Math.round(relY / STEP);

      if (this.canPlace(targetR, targetC)) {
        this.placeOnBoard(targetR, targetC, boardRect, tray.getBoundingClientRect());
        checkClear();
      } else {
        this.resetPosition();
      }
    });
  }

  canPlace(r, c) {
    for (let pr = 0; pr < this.shape.length; pr++) {
      for (let pc = 0; pc < this.shape[0].length; pc++) {
        if (this.shape[pr][pc] === 1) {
          const br = r + pr;
          const bc = c + pc;
          if (br < 0 || br >= BOARD_ROWS || bc < 0 || bc >= BOARD_COLS) return false;
          if (boardState[br][bc] !== null) return false;
        }
      }
    }
    return true;
  }

  placeOnBoard(r, c, boardRect, trayRect) {
    this.placedR = r;
    this.placedC = c;
    this.updateScale(1.0);
    for (let pr = 0; pr < this.shape.length; pr++) {
      for (let pc = 0; pc < this.shape[0].length; pc++) {
        if (this.shape[pr][pc] === 1) {
          boardState[r + pr][c + pc] = this.id;
        }
      }
    }

    const snapLeft = (boardRect.left + 6 + c * STEP) - trayRect.left;
    const snapTop = (boardRect.top + 6 + r * STEP) - trayRect.top;

    this.element.style.left = `${snapLeft}px`;
    this.element.style.top = `${snapTop}px`;
  }

  removeFromBoard() {
    if (this.placedR === null) return;
    for (let r = 0; r < BOARD_ROWS; r++) {
      for (let c = 0; c < BOARD_COLS; c++) {
        if (boardState[r][c] === this.id) {
          boardState[r][c] = null;
        }
      }
    }
    this.placedR = null;
    this.placedC = null;
  }
}

function checkClear() {
  for (let r = 0; r < BOARD_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      if (boardState[r][c] === null) return;
    }
  }

  selectPiece(null);
  isCleared = true;

  document.getElementById('tray-header').innerText = "AUTHENTICATION COMPLETE";
  document.getElementById('control-buttons').style.visibility = "hidden";
  document.getElementById('tray-instructions').style.visibility = "hidden";

  const boardRect = boardOuter.getBoundingClientRect();
  const trayRect = tray.getBoundingClientRect();

  pieceInstances.forEach(p => {
    p.element.classList.remove('selected');
    if (p.placedR === null) {
      p.element.style.display = 'none';
    } else {
      const snapLeft = (boardRect.left + 6 + p.placedC * STEP) - trayRect.left;
      const snapTop = (boardRect.top + 6 + p.placedR * STEP) - trayRect.top;
      p.element.style.left = `${snapLeft}px`;
      p.element.style.top = `${snapTop}px`;
      p.element.style.pointerEvents = 'none';
      p.element.style.cursor = 'default';
    }
  });

  document.getElementById('winner-list-link').href = displayUrl;
  document.getElementById('form-direct-link').href = targetUrl;
  document.getElementById('clear-result').style.display = 'flex';

  const overlay = document.getElementById('clear-overlay');
  overlay.classList.add('show');

  setTimeout(() => {
    overlay.classList.add('fade-out');
    setTimeout(() => {
      overlay.classList.remove('show', 'fade-out');
      window.open(targetUrl, '_blank');
    }, 600);
  }, 1500);
}