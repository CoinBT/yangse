(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let socket = null;
  let lastSignature = '';
  let wasAtBottom = true;
  const list = $('chatMessages'), form = $('chatForm'), input = $('chatInput'), send = $('chatSend');
  const clock = at => new Date(at).toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' });
  const connected = () => !!socket && socket.readyState === WebSocket.OPEN;
  const sync = () => { send.disabled = !connected(); input.disabled = !connected(); };
  form.addEventListener('submit', event => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || !connected()) return;
    socket.send(JSON.stringify({ action:'chat', text }));
    input.value = '';
    input.focus();
  });
  list.addEventListener('scroll', () => { wasAtBottom = list.scrollHeight - list.clientHeight - list.scrollTop < 65; });
  window.YSChat = {
    attachSocket(ws) {
      socket = ws; sync();
      ws.addEventListener('open', sync);
      ws.addEventListener('close', sync);
    },
    render(state) {
      const items = Array.isArray(state.chat) ? state.chat : [];
      const signature = items.map(x => x.id).join(',');
      if (signature === lastSignature) return;
      lastSignature = signature;
      const stick = wasAtBottom || !list.querySelector('.chat-message');
      list.innerHTML = items.length ? items.map(item => {
        if (item.kind === 'system') return `<div class="chat-system"><span>${esc(item.text)}</span><time>${clock(item.at)}</time></div>`;
        const mine = item.userId === state.me.id;
        return `<div class="chat-message ${mine ? 'mine' : ''}"><div class="chat-meta"><strong>${esc(item.name || '알 수 없음')}</strong>${item.role === 'spectator' ? '<span class="chat-spectator">관전</span>' : ''}<time>${clock(item.at)}</time></div><div class="chat-bubble">${esc(item.text)}</div></div>`;
      }).join('') : '<div class="chat-empty">친구들과 이야기해 보세요! 🎉</div>';
      if (stick) { list.scrollTop = list.scrollHeight; wasAtBottom = true; }
    }
  };
  sync();
})();