(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const choices = ['나라','게임','영화','애니메이션','음식','동물','스포츠','직업','유명인','장소'];
  let panel = '';
  let lastCategoryKey = '';
  let spinTimer = null;
  const tools = document.querySelector('.game-tools');
  const drawer = $('utilityDrawer');
  const backdrop = $('drawerBackdrop');
  function close() {
    panel = '';
    drawer.classList.add('hidden');
    backdrop.classList.add('hidden');
    for (const b of tools.querySelectorAll('[data-drawer]')) { b.classList.remove('active'); b.setAttribute('aria-expanded','false'); }
  }
  function open(pane) {
    if (panel === pane) { close(); return; }
    panel = pane;
    drawer.classList.remove('hidden'); backdrop.classList.remove('hidden');
    $('scorePane').classList.toggle('hidden',pane !== 'score');
    $('kickPane').classList.toggle('hidden',pane !== 'kick');
    $('drawerTitle').textContent = pane === 'score' ? '🏆 누적 스코어보드' : '🛡️ 참가자 관리';
    for (const b of tools.querySelectorAll('[data-drawer]')) { b.classList.toggle('active',b.dataset.drawer === pane); b.setAttribute('aria-expanded', String(b.dataset.drawer === pane)); }
    $('drawerClose').focus();
  }
  tools.addEventListener('click', e => {
    const button = e.target.closest('[data-drawer]');
    if (button && !button.disabled) open(button.dataset.drawer);
  });
  $('drawerClose').addEventListener('click',close);
  backdrop.addEventListener('click',close);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && panel) close(); });
  $('kickManage').addEventListener('click', e => {
    const btn = e.target.closest('[data-kick-id]');
    if (!btn || !window.YSUI.current || !window.YSUI.send) return;
    const member = window.YSUI.current.people.find(p => p.id === btn.dataset.kickId);
    if (!member || !confirm(member.name + '님을 내보낼까요? 상대 문제는 다시 지정해야 해요.')) return;
    window.YSUI.send('remove_player', { userId:member.id });
  });
  function drawCategory(s) {
    const box = $('categoryDisplay');
    if (!box) return;
    const key = s.code + ':' + s.roundNo + ':' + s.category;
    const text = box.querySelector('strong');
    if (key === lastCategoryKey) return;
    lastCategoryKey = key;
    clearInterval(spinTimer);
    box.classList.add('roulette-spinning');
    let n = 0;
    text.textContent = '🎲 ' + choices[0];
    spinTimer = setInterval(() => {
      if (++n >= 10) {
        clearInterval(spinTimer);
        box.classList.remove('roulette-spinning');
        text.textContent = '✨ ' + (s.category || '자유 주제');
      } else text.textContent = '🎲 ' + choices[n % choices.length];
    }, 90);
  }
  function render(s,send) {
    window.YSUI.current = s;
    if (send) window.YSUI.send = send;
    $('kickToggle').classList.toggle('hidden',!s.me.host);
    if (!s.me.host && panel === 'kick') close();
    const manage = $('kickManage');
    if (!s.me.host) manage.innerHTML = '<p class="drawer-hint">호스트만 강퇴할 수 있어요.</p>';
    else if (s.stage !== 'setup') manage.innerHTML = '<p class="drawer-hint">게임 진행 중에는 강퇴할 수 없어요. 다음 판 준비 시 이용해 주세요.</p>';
    else {
      const people = s.people.filter(p=>p.id!==s.hostId);
      manage.innerHTML = people.length ? people.map(p => '<div class="drawer-manage-row"><div><b>'+esc(p.name)+'</b><span>'+(p.online?'● 온라인':'○ 오프라인')+'</span></div><button class="btn btn-danger btn-small" data-kick-id="'+esc(p.id)+'">강퇴</button></div>').join('') : '<p class="drawer-hint">강퇴할 참가자가 없어요.</p>';
    }
    drawCategory(s);
    const hint = $('boardHint');
    if (hint && s.stage === 'setup' && s.gameMode === 'classic') hint.textContent = '대분류: ' + (s.category || '자유');
    const action = $('actionText');
    if (action) {
      action.title = 'Enter: 질문 제출 · Shift+Enter: 정답 제출';
      if (!document.getElementById('actionKeyHint')) action.insertAdjacentHTML('afterend','<p id="actionKeyHint" class="input-key-hint">↵ Enter: 질문 제출 · ⇧ Shift + Enter: 정답 제출</p>');
    }
  }
  window.YSUI = {render,send:null,current:null,close};
})();