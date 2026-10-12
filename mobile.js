/* Mobile touch controls + error overlay */
export function setupMobile(onInput){
  if (!('ontouchstart' in window) && navigator.maxTouchPoints === 0) return;

  /* --- on-screen controls --- */
  const wrap = document.createElement('div');
  wrap.id = 'touch-controls';
  wrap.innerHTML = `
    <div class="tc-left">
      <button data-k="left"  class="tc-btn">◀</button>
      <button data-k="right" class="tc-btn">▶</button>
    </div>
    <div class="tc-right">
      <button data-k="back"  class="tc-btn tc-sm">▼</button>
      <button data-k="fwd"   class="tc-btn">▲</button>
      <button data-k="nos"   class="tc-btn tc-nos">N2O</button>
    </div>
  `;
  document.body.appendChild(wrap);

  const style = document.createElement('style');
  style.textContent = `
    #touch-controls{position:fixed;inset:0;z-index:15;pointer-events:none;display:none}
    #touch-controls.on{display:block}
    .tc-left,.tc-right{position:absolute;bottom:20px;display:flex;gap:12px;pointer-events:auto}
    .tc-left{left:20px}
    .tc-right{right:20px;align-items:flex-end}
    .tc-btn{width:70px;height:70px;border-radius:50%;border:1px solid rgba(255,255,255,.2);
      background:rgba(15,20,40,.65);color:#fff;font-size:1.4rem;font-weight:900;backdrop-filter:blur(10px);
      -webkit-user-select:none;user-select:none;touch-action:none;font-family:inherit}
    .tc-btn:active{background:rgba(60,242,196,.35)}
    .tc-sm{width:56px;height:56px;font-size:1.1rem}
    .tc-nos{background:rgba(255,59,48,.5);border-color:rgba(255,90,80,.6);font-size:.75rem;letter-spacing:.1em}
    .tc-nos:active{background:rgba(255,90,80,.7)}
  `;
  document.head.appendChild(style);

  const state = {fwd:false,back:false,left:false,right:false,nos:false};
  const keyMap = {fwd:'f',back:'b',left:'l',right:'r',nos:'n'};

  wrap.querySelectorAll('.tc-btn').forEach(btn => {
    const k = keyMap[btn.dataset.k];
    const on = e => { e.preventDefault(); state[k] = true; onInput(state); };
    const off = e => { e.preventDefault(); state[k] = false; onInput(state); };
    btn.addEventListener('touchstart', on, {passive:false});
    btn.addEventListener('touchend', off, {passive:false});
    btn.addEventListener('touchcancel', off, {passive:false});
    btn.addEventListener('mousedown', on);
    btn.addEventListener('mouseup', off);
  });

  window.__showTouch = () => wrap.classList.add('on');
  window.__hideTouch = () => wrap.classList.remove('on');
}

/* Error overlay so you can SEE what's failing */
export function setupErrorOverlay(){
  const box = document.createElement('div');
  box.id = 'err-box';
  box.style.cssText = `position:fixed;bottom:0;left:0;right:0;max-height:40vh;overflow:auto;
    background:rgba(180,20,20,.95);color:#fff;font:12px monospace;padding:14px;z-index:9999;display:none;
    white-space:pre-wrap;border-top:2px solid #fff`;
  document.body.appendChild(box);

  const show = (msg) => {
    box.style.display = 'block';
    box.textContent += msg + '\n';
  };

  window.addEventListener('error', e => {
    show('❌ ' + e.message + ' @ ' + (e.filename||'?') + ':' + (e.lineno||'?'));
  });
  window.addEventListener('unhandledrejection', e => {
    show('❌ Promise: ' + (e.reason?.message || e.reason));
  });

  /* catch Three.js / WebGL load failures */
  setTimeout(() => {
    if (!document.querySelector('canvas').getContext) {
      show('⚠️ Canvas / WebGL may have failed to initialize');
    }
  }, 3000);
}