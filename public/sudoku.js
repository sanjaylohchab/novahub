// ================= SUDOKU OFFLINE LOGIC =================
const sudokuBoard = document.getElementById('sudoku-board');
const numpadBtns = document.querySelectorAll('.num-btn');
const undoBtn = document.getElementById('undo-btn');
const eraseBtn = document.getElementById('erase-btn');
const hintBtn = document.getElementById('hint-btn');
const menuBtn = document.getElementById('menu-btn');
const overlay = document.getElementById('hamburger-overlay');
const menu = document.getElementById('hamburger-menu');

let currentGrid = Array(81).fill(0);
let solutionGrid = Array(81).fill(0);
let initialGrid = Array(81).fill(0);
let selectedIndex = null;

let level = 1;
let mistakes = 0;
const MAX_MISTAKES = 10;
let historyStack = [];
let timerSeconds = 0;
let timerInterval = null;
let activeDifficulty = 'Easy';

// Menu & Dropdown Logic
menuBtn.onclick = () => { menu.classList.add("open"); overlay.style.display = "block"; };
overlay.onclick = () => { menu.classList.remove("open"); overlay.style.display = "none"; document.getElementById('diff-menu').classList.remove('show'); };
document.getElementById("new-game-btn").onclick = () => { startNewGame(); overlay.click(); };
document.getElementById("fast-new-btn").onclick = () => { startNewGame(); };

const diffTrigger = document.getElementById('diff-trigger');
const diffMenu = document.getElementById('diff-menu');
diffTrigger.addEventListener('click', (e) => { e.stopPropagation(); diffMenu.classList.toggle('show'); overlay.style.display = diffMenu.classList.contains('show') ? 'block' : 'none'; });
document.querySelectorAll('.diff-opt').forEach(opt => {
  opt.addEventListener('click', () => {
    activeDifficulty = opt.dataset.diff;
    document.getElementById('sk-diff-text').innerHTML = activeDifficulty + ' <span class="material-icons" style="font-size:14px; margin-top:2px;">expand_more</span>';
    startNewGame();
    overlay.click();
  });
});

function updateTimer() {
  let m = Math.floor(timerSeconds / 60).toString().padStart(2, '0');
  let s = (timerSeconds % 60).toString().padStart(2, '0');
  document.getElementById('sk-timer').innerText = `${m}:${s}`;
}

// ---------------- ALGORITHMS ----------------
function generateSolution() {
  let base = [
    1,2,3, 4,5,6, 7,8,9,
    4,5,6, 7,8,9, 1,2,3,
    7,8,9, 1,2,3, 4,5,6,
    2,3,4, 5,6,7, 8,9,1,
    5,6,7, 8,9,1, 2,3,4,
    8,9,1, 2,3,4, 5,6,7,
    3,4,5, 6,7,8, 9,1,2,
    6,7,8, 9,1,2, 3,4,5,
    9,1,2, 3,4,5, 6,7,8
  ];
  for(let i=1; i<=9; i++) {
    let swapWith = Math.floor(Math.random() * 9) + 1;
    for(let j=0; j<81; j++) {
      if(base[j] === i) base[j] = 100 + swapWith;
      else if(base[j] === swapWith) base[j] = 100 + i;
    }
    for(let j=0; j<81; j++) if(base[j] > 100) base[j] -= 100;
  }
  return base;
}

function startNewGame() {
  solutionGrid = generateSolution();
  currentGrid = [...solutionGrid];
  
  let blanks = 30;
  if (activeDifficulty === 'Medium') blanks = 40;
  else if (activeDifficulty === 'Hard') blanks = 50;
  else if (activeDifficulty === 'Expert') blanks = 58;

  let blanksMade = 0; 
  while(blanksMade < blanks) {
    let rIdx = Math.floor(Math.random() * 81);
    if(currentGrid[rIdx] !== 0) { currentGrid[rIdx] = 0; blanksMade++; }
  }
  
  initialGrid = [...currentGrid];
  historyStack = [];
  mistakes = 0;
  document.getElementById("sk-mistakes").innerText = mistakes;
  document.getElementById("sk-level").innerText = `Level ${level} (${activeDifficulty})`;
  
  clearInterval(timerInterval);
  timerSeconds = 0;
  updateTimer();
  timerInterval = setInterval(() => { timerSeconds++; updateTimer(); }, 1000);
  
  selectedIndex = null;
  renderBoard();
}

// ---------------- RENDER & HIGHLIGHT ----------------
function renderBoard() {
  sudokuBoard.innerHTML = '';
  for(let i = 0; i < 81; i++) {
    let val = currentGrid[i];
    let cell = document.createElement('div');
    cell.className = 'sk-cell';
    cell.dataset.index = i;
    
    let r = Math.floor(i / 9); let c = i % 9;
    if (c === 8) cell.classList.add('no-right');
    if (r === 8) cell.classList.add('no-bottom');
    if (c === 2 || c === 5) cell.classList.add('thick-right');
    if (r === 2 || r === 5) cell.classList.add('thick-bottom');
    
    if(val !== 0) {
      cell.textContent = val;
      if(initialGrid[i] !== 0) cell.classList.add('fixed');
      else if(val !== solutionGrid[i]) cell.classList.add('error');
    }
    
    cell.addEventListener('click', () => { selectedIndex = i; applyHighlights(); });
    sudokuBoard.appendChild(cell);
  }
  applyHighlights();
  checkCompletedNumbers(); 
}

function applyHighlights() {
  let cells = sudokuBoard.children;
  for(let i=0; i<81; i++) { cells[i].classList.remove('selected', 'related', 'same-num'); }
  if(selectedIndex === null) return;
  
  let r = Math.floor(selectedIndex / 9); let c = selectedIndex % 9;
  let bR = Math.floor(r / 3) * 3; let bC = Math.floor(c / 3) * 3;
  let selectedVal = currentGrid[selectedIndex];

  for(let i=0; i<81; i++) {
    let currR = Math.floor(i / 9); let currC = i % 9;
    if(currR === r || currC === c || (currR >= bR && currR < bR+3 && currC >= bC && currC < bC+3)) {
      cells[i].classList.add('related');
    }
    if(selectedVal !== 0 && currentGrid[i] === selectedVal && currentGrid[i] === solutionGrid[i]) {
      cells[i].classList.add('same-num');
    }
  }
  cells[selectedIndex].classList.remove('related', 'same-num');
  cells[selectedIndex].classList.add('selected');
}

// ---------------- NUMBER COMPLETION CHECK ----------------
function checkCompletedNumbers() {
  let counts = { 1:0, 2:0, 3:0, 4:0, 5:0, 6:0, 7:0, 8:0, 9:0 };
  
  for(let i=0; i<81; i++){
    let val = currentGrid[i];
    if(val !== 0 && val === solutionGrid[i]){
      counts[val]++;
    }
  }

  numpadBtns.forEach(btn => {
    let num = parseInt(btn.dataset.val);
    if(counts[num] === 9) {
      btn.style.opacity = "0.2"; 
      btn.style.pointerEvents = "none";
    } else {
      btn.style.opacity = "1";
      btn.style.pointerEvents = "auto";
    }
  });
}

// ---------------- INPUT LOGIC ----------------
function handleInput(val) {
  if(selectedIndex === null) return;
  if(initialGrid[selectedIndex] !== 0) return; 
  if(currentGrid[selectedIndex] !== 0 && currentGrid[selectedIndex] === solutionGrid[selectedIndex]) return; // Can't overwrite right answer

  historyStack.push({ idx: selectedIndex, oldVal: currentGrid[selectedIndex] });
  currentGrid[selectedIndex] = val;
  
  if(val !== 0 && val !== solutionGrid[selectedIndex]) {
    mistakes++;
    document.getElementById('sk-mistakes').textContent = mistakes;
    if(mistakes >= MAX_MISTAKES) {
      setTimeout(() => { alert("Game Over! You reached 10 mistakes."); startNewGame(); }, 100);
    }
  }
  
  renderBoard();
  checkWin();
}

numpadBtns.forEach(btn => { btn.addEventListener('click', () => handleInput(parseInt(btn.dataset.val))); });
eraseBtn.addEventListener('click', () => handleInput(0));
undoBtn.addEventListener('click', () => {
  if(historyStack.length === 0) return;
  let lastState = historyStack.pop();
  currentGrid[lastState.idx] = lastState.oldVal;
  selectedIndex = lastState.idx;
  renderBoard();
});

hintBtn.addEventListener('click', () => {
  if(selectedIndex === null) { alert("Select an empty box first!"); return; }
  if(initialGrid[selectedIndex] !== 0 || currentGrid[selectedIndex] === solutionGrid[selectedIndex]) return;

  historyStack.push({ idx: selectedIndex, oldVal: currentGrid[selectedIndex] });
  currentGrid[selectedIndex] = solutionGrid[selectedIndex];
  renderBoard();
  checkWin();
});

function checkWin() {
  for(let i=0; i<81; i++) {
    if(currentGrid[i] === 0 || currentGrid[i] !== solutionGrid[i]) return;
  }
  clearInterval(timerInterval);
  setTimeout(() => {
    alert(`Excellent! Level ${level} completed!`);
    level++;
    startNewGame();
  }, 300);
}

// Start
startNewGame();
