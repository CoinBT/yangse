(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const rankPoints = [100, 80, 60];
  const url = new URL(location.href);
  const inviteCode = (url.searchParams.get('room') || '').trim().toUpperCase();
  let mode = inviteCode ? 'join' : 'create';
  let role = 'player';
  let session = null;
  let socket = null;
  let state = null;
  let reconnectTimer = null;
  let shouldReconnect = true;
  let draftTopic = '';
  let draftTopicTarget = '';
  let draftText = '';
  let spoilerShown = false;
  let toastTimer = null;
  let lastRoundSeen = null;

  function toast(msg) {
    const element = $('toast');
    element.textContent = msg;
    element.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.remove('show'), 3500);
  }
  async function api(route, data) {
    const response = await fetch(`/api/${route}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '서버 요청이 실패했어요.');
    return result;
  }
  function tab(next) {
    mode = next;
    $('tabCreate').classList.toggle('is-active', mode === 'create');
    $('tabJoin').classList.toggle('is-active', mode === 'join');
    $('joinFields').classList.toggle('hidden', mode !== 'join');
    $('entryTitle').textContent = mode === 'create' ? '새 게임방 만들기' : '친구 게임방에 입장';
    $('entrySubtitle').textContent = mode === 'create' ? '방을 만들고 친구들을 초대해 보세요.' : '초대 코드를 받고 함께 게임을 즐겨요.';
    $('entrySubmit').innerHTML = mode === 'create' ? '새 게임방 만들기 <span>↗</span>' : '게임방 입장하기 <span>↗</span>';
  }
  function selectRole(next) {
    role = next;
    for (const el of document.querySelectorAll('.role')) el.classList.toggle('is-selected', el.dataset.role === role);
  }
  function openRoom(data) {
    session = data;
    localStorage.setItem('ysgame_room_' + data.code, JSON.stringify(data));
    localStorage.setItem('ysgame_current_room', data.code);
    history.replaceState(null, '', `/?room=${encodeURIComponent(data.code)}`);
    $('landing').classList.add('hidden');
    $('roomView').classList.remove('hidden');
    $('roomCode').textContent = data.code;
    connect();
  }
  async function handleEntry(event) {
    event.preventDefault();
    const name = $('nickname').value.trim();
    if (!name) return toast('닉네임을 입력해 주세요.');
    const submit = $('entrySubmit');
    submit.disabled = true;
    try {
      let data;
      if (mode === 'create') {
        data = await api('create', { name });
      } else {
        const code = $('joinCode').value.trim().toUpperCase();
        if (code.length !== 6) return toast('6자리 초대 코드를 입력해 주세요.');
        data = await api('join', { code, name, mode: role });
      }
      localStorage.setItem('ysgame_lastname', name);
      openRoom(data);
    } catch (error) { toast(error.message); }
    finally { submit.disabled = false; }
  }
  function connectionStatus(connected) {
    $('liveDot').classList.toggle('offline', !connected);
    $('connectionText').textContent = connected ? '실시간 연결됨' : '연결 중...';
  }
  function connect() {
    if (!session || !shouldReconnect) return;
    clearTimeout(reconnectTimer);
    if (socket) { socket.onclose = null; socket.close(); }
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const path = `${proto}//${location.host}/ws?room=${encodeURIComponent(session.code)}&token=${encodeURIComponent(session.token)}`;
    socket = new WebSocket(path);
    window.YSChat?.attachSocket(socket);
    window.YSVoice?.attachSocket(socket);
    socket.onopen = () => connectionStatus(true);
    socket.onmessage = (evt) => {
      let message;
      try { message = JSON.parse(evt.data); } catch { return; }
      if (message.type === 'error') toast(message.message);
      if (message.type === 'state') {
        const previous = state;
        state = message.state;
        if (previous && previous.stage === 'play' && state.stage === 'setup' && state.lastOutcome?.round !== lastRoundSeen) {
          lastRoundSeen = state.lastOutcome.round;
          draftTopic = ''; draftText = '';
          toast('🎉 이번 판이 끝났어요! 다음 판을 준비해 주세요.');
        }
        render();
      }
    };
    socket.onclose = () => {
      connectionStatus(false);
      if (!shouldReconnect) return;
      reconnectTimer = setTimeout(connect, 2400);
    };
    socket.onerror = () => connectionStatus(false);
  }
  function act(action, extra = {}) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return toast('서버 연결 중이에요. 잠시 후 다시 눌러 주세요.');
    socket.send(JSON.stringify({ action, ...extra }));
  }
  function person(uid) { return state?.people.find(p => p.id === uid); }
  function isMeTurn() { return state?.stage === 'play' && state.me.role === 'player' && state.turnId === state.me.id; }
  function seatText(p) {
    if (p.finished) return '✓ 정답 완료';
    if (state.gameMode === 'host_show' && p.id === state.hostId) return '👑 진행 호스트';
    if (state.gameMode === 'host_show' && state.me.id !== state.hostId) return '🔒 비밀 주제';
    if (state.me.id === p.id) return '🔒 나의 주제 비밀';
    if (state.me.role === 'spectator' && !spoilerShown) return p.subjectReady ? '비밀 주제' : '주제 대기';
    const subject = state.topics[p.id];
    if (subject) return subject;
    return '주제 대기';
  }
  function renderBoard() {
    const people = state.people;
    const seats = $('seats');
    seats.innerHTML = people.map((p, i) => {
      const radians = (i / Math.max(people.length, 1)) * Math.PI * 2;
      const x = 50 + 46 * Math.sin(radians);
      const y = 50 - 46 * Math.cos(radians);
      const classes = ['seat', p.id === state.me.id ? 'self' : '', p.id === state.turnId && state.stage === 'play' ? 'turn' : '', p.finished ? 'finished' : '', p.online ? '' : 'offline'].filter(Boolean).join(' ');
      const info = seatText(p);
      return `<div class="${classes}" style="left:${x}%;top:${y}%" title="${esc(p.name)} · ${esc(info)}">
        ${state.firstId === p.id && state.stage === 'play' ? '<div class="seat-badge">START</div>' : ''}
        <div class="seat-avatar">${p.finished ? '🏅' : p.id === state.me.id ? '😊' : p.id === state.turnId && state.stage === 'play' ? '🎤' : '👤'}</div>
        <div class="seat-name">${esc(p.name)}${p.id === state.hostId ? ' ★' : ''}</div>
        <div class="seat-detail">${esc(info)}</div>
      </div>`;
    }).join('');
    if (!people.length) {
      $('boardCenter').innerHTML = '<div class="center-symbol">✦</div><div class="center-title">참가자 모집 중</div>';
      return;
    }
    if (state.stage === 'setup') {
      $('boardCenter').innerHTML = `<div class="center-symbol">🎭</div><div class="center-kicker">GET READY</div><div class="center-title">주제를 정해요!</div><div class="center-info">${state.readyCount} / ${people.length}명 작성 완료</div>`;
    } else {
      const current = person(state.turnId);
      const title = state.pending?.type === 'answer' ? '정답 판정 중' : state.pending?.type === 'question' ? '질문 중!' : '누구일까?';
      $('boardCenter').innerHTML = `<div class="center-symbol">${state.pending?.type === 'answer' ? '⚖️' : '🎤'}</div><div class="center-kicker">ROUND ${state.roundNo}</div><div class="center-title">${title}</div><div class="center-info">${esc(current?.name || '연결 대기')}님의 차례</div>`;
    }
    $('boardHint').textContent = state.stage === 'setup' ? '오른쪽 = 시계 방향 →' : `정답자 ${state.winners.length} / ${Math.min(3, people.length)}명`;
  }
  function renderGallery() {
    const gallery = $('topicGallery');
    if (state.stage !== 'play') { gallery.classList.add('hidden'); return; }
    gallery.classList.remove('hidden');
    gallery.innerHTML = `<div class="gallery-heading"><span>🔎 참가자별 주제 ${state.me.role === 'spectator' ? '(관전 모드)' : '(내 주제만 비공개)'}</span>${state.me.role === 'spectator' ? `<button type="button" class="btn btn-small btn-outline" data-event="spoiler">${spoilerShown ? '🙈 주제 가리기' : '👁 스포일러 보기'}</button>` : ''}</div><div class="gallery-items">${state.people.map(p => {
      const invisible = p.id === state.me.id || (state.me.role === 'spectator' && !spoilerShown);
      return `<div class="gallery-card"><div class="gallery-name">${esc(p.name)}</div><div class="gallery-topic ${invisible ? 'hidden-topic' : ''}">${p.id === state.me.id ? '🔒 내 주제' : invisible ? '🔒 숨김' : esc(state.topics[p.id] || '미입력')}</div></div>`;
    }).join('')}</div>`;
  }
  function winnerBoxes(winners) {
    return winners.length ? winners.map(w => `<div class="alert-slice ${w.rank === 1 ? 'amber' : ''}">${w.rank}등 · <b>${esc(w.name)}</b> <strong>+${w.points}점</strong></div>`).join('') : '<div class="mission-note">아직 정답자가 없어요.</div>';
  }
  function renderSetup() {
    $('actionEyebrow').textContent = 'YOUR MISSION';
    $('actionTitle').textContent = '상대 문제 정하기';
    $('actionIcon').textContent = '✏️';
    const content = $('actionContent');
    const count = state.people.length;
    const ready = state.readyCount;
    const right = state.myRightTarget;
    if (state.me.role === 'spectator') {
      content.innerHTML = `<div class="mission-box"><div class="mission-label">SPECTATOR MODE</div><div class="mission-name">👀 관전석</div><div class="mission-hint">참가자들이 주제를 적고 있어요. 관전은 게임 인원에 포함되지 않고 투표에도 참여하지 않아요.</div></div><div class="progress-track"><div class="progress-fill" style="width:${count ? 100 * ready / count : 0}%"></div></div><div class="progress-caption"><span>준비 진행률</span><b>${ready} / ${count}</b></div>`;
      return;
    }
    if (right && draftTopicTarget !== right.id) {
      draftTopicTarget = right.id;
      draftTopic = right.text;
    }
    if (right && draftTopic === '' && right.assigned) draftTopic = right.text;
    let html = `<div class="mission-box"><div class="mission-label">OPPONENT CHALLENGE →</div><div class="mission-name">${right ? esc(right.name) : '친구를 초대해 주세요'}</div><div class="mission-hint">내 오른쪽(시계 방향)에 있는 사람의 머리 위에 붙일 비밀 주제를 정해 주세요.</div></div>`;
    if (right) {
      html += `<label for="topicInput">${esc(right.name)}님의 정답 정하기</label><input class="field" id="topicInput" type="text" maxlength="50" placeholder="예: 손흥민, 바나나, 피카츄..." value="${esc(draftTopic)}"><button class="btn btn-primary btn-wide" id="saveTopic" type="button">${right.assigned ? '주제 수정해서 저장' : '이 주제로 확정하기'} <span>✓</span></button>`;
      html += `<div class="mission-note">🔐 주제를 받는 사람에게만 이 단어가 숨겨져요. 라운드 시작 전까지 변경할 수 있어요.</div>`;
    } else html += `<div class="alert-slice purple">친구가 한 명 이상 참가하면 오른쪽 사람에게 주제를 줄 수 있어요.</div>`;
    html += `<div class="progress-track"><div class="progress-fill" style="width:${count ? 100 * ready / count : 0}%"></div></div><div class="progress-caption"><span>주제 설정 완료</span><b>${ready} / ${count}</b></div>`;
    if (state.lastOutcome) {
      html += `<div class="mission-box"><div class="mission-label">LAST ROUND · ${state.lastOutcome.round}판</div><div class="mission-name">🏆 직전 게임 결과</div>${winnerBoxes(state.lastOutcome.winners)}<div class="mission-note">이전 점수는 스코어보드에 그대로 누적됐어요.</div></div>`;
    }
    if (state.me.host) {
      html += `<button class="btn btn-mint btn-wide" data-action="start" ${state.canStart ? '' : 'disabled'}>🚀 게임 시작하기 <span>→</span></button>`;
      html += `<p class="note-small">${state.canStart ? '준비 끝! 시작하면 첫 번째 순서가 무작위로 정해져요.' : '최소 2명, 모두 온라인, 전원 주제 지정 시 시작 가능해요.'}</p>`;
      if (count > 1) {
        html += `<div class="mission-box utility-managed hidden"><div class="mission-label">HOST CONTROLS</div><div class="mission-hint" style="margin-top:9px">참가자 관리 · 퇴장 시 모든 주제를 다시 입력해야 해요.</div>${state.people.filter(p => p.id !== state.hostId).map(p => `<div class="manage-row" style="display:flex;align-items:center;justify-content:space-between;gap:9px;margin-top:10px;font-size:12px"><span>${esc(p.name)} <small style="color:${p.online ? '#82e9c4' : '#ff91a4'}">${p.online ? '● 온라인' : '● 오프라인'}</small></span><button class="btn btn-outline btn-small" data-event="remove" data-id="${esc(p.id)}">내보내기</button></div>`).join('')}</div>`;
      }
    } else {
      html += `<div class="alert-slice purple">👑 호스트가 게임 시작 버튼을 누르면 라운드가 시작돼요.</div>`;
    }
    content.innerHTML = html;
  }
  function renderPlay() {
    const active = person(state.turnId);
    const meTurn = isMeTurn();
    const pending = state.pending;
    $('actionEyebrow').textContent = `ROUND ${state.roundNo} · PLAY TIME`;
    $('actionTitle').textContent = meTurn ? '당신의 차례!' : `${active?.name || '다음'}님의 차례`;
    $('actionIcon').textContent = meTurn ? '🎤' : '🎲';
    let html = '';
    if (state.winners.length) {
      html += `<div class="mission-box"><div class="mission-label">CURRENT RANKING</div>${winnerBoxes(state.winners)}</div>`;
    }
    if (!pending) {
      if (meTurn) {
        html += `<div class="mission-box"><div class="mission-label">YOUR TURN!</div><div class="mission-name">나의 정체를 추리하세요</div><div class="mission-hint">자신의 주제는 볼 수 없어요. 질문하거나 정답을 말해 보세요.</div></div><label for="actionText">질문/정답 내용 (선택사항)</label><input type="text" class="field" maxlength="100" id="actionText" placeholder="이곳에 질문 혹은 정답을 입력하고 엔터" value="${esc(draftText)}"><div class="action-buttons"><button class="btn btn-outline" data-event="question">❔ 질문하기<small>확인 후 차례 넘기기</small></button><button class="btn btn-yellow" data-event="answer">✨ 정답 말하기<small>자동 정답 판정</small></button></div>`;
      } else {
        html += `<div class="mission-box"><div class="mission-label">NOW PLAYING</div><div class="mission-name">${esc(active?.name || '접속 대기')}님</div><div class="mission-hint">차례가 돌아올 때까지 기다려 주세요. 질문이 끝나면 오른쪽 사람에게 순서가 넘어가요.</div></div>`;
      }
    } else if (pending.type === 'question') {
      html += `<div class="mission-box"><div class="mission-label">QUESTION TIME</div><div class="mission-name">❔ 질문 중</div><div class="mission-hint">${esc(active?.name || '참가자')}님이 질문을 하고 있어요.</div>${pending.text ? `<div class="alert-slice purple" style="word-break:break-word">“${esc(pending.text)}”</div>` : `<div class="mission-note">마이크나 음성채팅으로 질문할 수 있어요.</div>`}</div>`;
      if (meTurn) html += `<button class="btn btn-primary btn-wide" data-action="confirm_question">✓ 확인 · 다음 사람에게 넘기기 <span>→</span></button>`;
      else html += '<div class="alert-slice purple">질문자가 [확인]을 누르면 다음 차례로 진행돼요.</div>';
    } else if (pending.type === 'answer') {
      html += `<div class="mission-box"><div class="mission-label">VOTE IN PROGRESS</div><div class="mission-name">⚖️ 정답 판정!</div><div class="mission-hint">${esc(active?.name || '참가자')}님의 정답 시도를 판정해 주세요.</div>${pending.text ? `<div class="alert-slice purple" style="font-size:15px;font-weight:800;word-break:break-word">“${esc(pending.text)}”</div>` : '<div class="mission-note">입력된 텍스트가 없으면 음성으로 말한 답을 듣고 판정하세요.</div>'}</div>`;
      const cast = pending.correct + pending.wrong;
      html += `<div class="progress-track"><div class="progress-fill" style="width:${pending.total ? 100 * cast / pending.total : 0}%"></div></div><div class="progress-caption"><span>투표 ${cast} / ${pending.total}명</span><span>과반수 기준: ${pending.required}표</span></div><div class="vote-grid"><div class="alert-slice" style="margin:0;text-align:center">⭕ 정답 ${pending.correct}표</div><div class="alert-slice amber" style="margin:0;text-align:center">✕ 오답 ${pending.wrong}표</div></div>`;
      if (pending.canVote) html += `<div class="vote-grid"><button class="btn btn-mint" data-event="vote" data-vote="correct">⭕ 정답</button><button class="btn btn-danger" data-event="vote" data-vote="wrong">✕ 오답</button></div>`;
      else if (pending.myVote) html += `<div class="alert-slice">✓ 투표 완료 · ${pending.myVote === 'correct' ? '정답' : '오답'}에 투표했어요.</div>`;
      else html += `<div class="alert-slice purple">${meTurn ? '본인은 투표할 수 없어요. 다른 참가자의 판정을 기다려 주세요.' : '관전자는 투표할 수 없어요.'}</div>`;
      html += '<p class="note-small">정답표가 유효 투표자 과반수이면 성공! 오답 과반수이거나 전원 투표 후 정답 과반수 미달이면 다음 사람으로 넘어가요.</p>';
    }
    if (state.me.host) {
      html += `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:23px;padding-top:17px;border-top:1px solid #3d344f"><button class="btn btn-outline btn-small" data-action="host_skip">⏭ 차례 강제 넘기기</button><button class="btn btn-danger btn-small" data-event="finish">⏹ 이번 판 종료</button></div>`;
    }
    $('actionContent').innerHTML = html;
  }
  function renderScores() {
    const list = state.scoreboard;
    $('scoreboard').innerHTML = list.length ? list.map((s, i) => `<div class="score-row ${s.userId === state.me.id ? 'is-me' : ''}"><span class="score-rank ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span><span class="score-name">${esc(s.name)}${s.userId === state.me.id ? ' (나)' : ''}</span><span class="score-tally">${s.total}<small>PTS</small></span></div>`).join('') : '<div class="empty-note">아직 기록이 없어요.</div>';
  }
  function renderHistory() {
    const history = state.history;
    $('historyContent').innerHTML = history.length ? `<div class="history-list">${history.map(h => `<div class="history-item"><span class="history-id">#${h.round}</span><div><div class="history-meta">${new Intl.DateTimeFormat('ko-KR', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' }).format(h.at)}${h.forced ? ' · 호스트 종료' : ''}</div><div class="history-info">${h.winners.length ? h.winners.map(w => `<span>${w.rank}등 <b>${esc(w.name)}</b> +${w.points}점</span>`).join(' · ') : '정답자 없이 종료'}</div></div></div>`).join('')}</div>` : '<div class="empty-note">첫 게임이 끝나면 라운드별 결과가 이곳에 쌓여요.</div>';
  }
  function renderFeed() {
    $('feedContent').innerHTML = state.log.length ? `<div class="feed-list">${state.log.map(l => `<div class="feed-item"><span class="feed-dot"></span><span>${esc(l.message)}</span><span class="feed-time">${new Date(l.at).toLocaleTimeString('ko-KR', {hour:'2-digit',minute:'2-digit'})}</span></div>`).join('')}</div>` : '<div class="empty-note">게임 활동 기록이 여기에 표시됩니다.</div>';
  }
  function render() {
    if (!state) return;
    $('peopleCount').textContent = state.people.length;
    $('spectatorCount').textContent = state.spectatorCount;
    $('phaseBadge').textContent = state.stage === 'setup' ? '✏️ 상대 문제 정하기' : `🎲 ${state.roundNo}판 진행 중`;
    $('roomSubtitle').textContent = state.stage === 'setup' ? '이번 판의 대분류 안에서 오른쪽 사람의 정답을 지정해 주세요.' : '첫 순서는 랜덤! 오른쪽(시계 방향)으로 차례가 돌아가요.';
    $('selfBadge').textContent = state.me.host ? '👑 호스트' : state.me.role === 'spectator' ? '👀 관전자' : `😊 ${state.me.name}`;
    renderBoard();
    renderGallery();
    if (state.stage === 'setup') renderSetup(); else renderPlay();
    renderScores(); renderHistory(); renderFeed();
    window.YSChat?.render(state);
    window.YSMode?.render(state, act, draftText);
    window.YSUI?.render(state, act);
    window.YSVoice?.render(state);
  }
  async function copy(value) {
    try { await navigator.clipboard.writeText(value); toast('클립보드에 복사했어요!'); }
    catch {
      const area = document.createElement('textarea');
      area.value = value; area.style.position = 'fixed'; area.style.opacity = '0';
      document.body.appendChild(area); area.select();
      const success = document.execCommand('copy'); area.remove();
      toast(success ? '클립보드에 복사했어요!' : '복사할 수 없어요. 주소창을 직접 복사해 주세요.');
    }
  }
  document.addEventListener('input', (event) => {
    if (event.target.id === 'topicInput') draftTopic = event.target.value;
    if (event.target.id === 'actionText') draftText = event.target.value;
  });
  document.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action],button[data-event]');
    if (!button || !state) return;
    if (button.dataset.action) {
      act(button.dataset.action);
      return;
    }
    switch (button.dataset.event) {
      case 'question': act('question', { text: draftText.trim() }); draftText = ''; break;
      case 'answer': act('answer', { text: draftText.trim() }); draftText = ''; break;
      case 'vote': act('vote', { vote: button.dataset.vote }); break;
      case 'spoiler': spoilerShown = !spoilerShown; renderBoard(); renderGallery(); break;
      case 'finish': if (confirm('정답자가 세 명 나오기 전에 이번 판을 종료할까요? 누적 점수는 유지됩니다.')) act('end_round'); break;
      case 'remove': if (confirm('이 참가자를 내보낼까요? 모든 주제를 다시 입력해야 해요.')) act('remove_player', { userId: button.dataset.id }); break;
    }
  });
  document.addEventListener('keydown', event => {
    if (event.target?.id !== 'actionText' || event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    if (!isMeTurn() || state?.pending) return;
    const text = event.target.value.trim();
    if (event.shiftKey) {
      if (!text) return toast('정답을 입력해 주세요.');
      act('answer', { text });
    } else {
      act('question', { text });
    }
    draftText = '';
  });
  $('tabCreate').addEventListener('click', () => tab('create'));
  $('tabJoin').addEventListener('click', () => tab('join'));
  document.querySelectorAll('.role').forEach(button => button.addEventListener('click', () => selectRole(button.dataset.role)));
  $('entryForm').addEventListener('submit', handleEntry);
  $('copyCode').addEventListener('click', () => session && copy(session.code));
  $('copyInvite').addEventListener('click', () => session && copy(`${location.origin}/?room=${session.code}`));
  $('actionContent').addEventListener('click', (event) => {
    if (event.target.closest('#saveTopic')) {
      const topic = ($('topicInput')?.value || '').trim();
      if (!topic) return toast('주제를 입력해 주세요.');
      act('set_topic', { topic });
    }
  });
  $('leaveRoom').addEventListener('click', () => {
    window.YSVoice?.shutdown();
    shouldReconnect = false;
    if (socket) socket.close();
    localStorage.removeItem('ysgame_current_room');
    location.href = '/';
  });
  window.addEventListener('beforeunload', () => { shouldReconnect = false; window.YSVoice?.shutdown(); });
  async function init() {
    $('nickname').value = localStorage.getItem('ysgame_lastname') || '';
    if (inviteCode) { tab('join'); $('joinCode').value = inviteCode; }
    const stored = inviteCode && localStorage.getItem('ysgame_room_' + inviteCode);
    if (stored) {
      try {
        const previous = JSON.parse(stored);
        const data = await api('rejoin', { code: inviteCode, token: previous.token });
        openRoom(data);
        return;
      } catch { localStorage.removeItem('ysgame_room_' + inviteCode); }
    }
    connectionStatus(true);
  }
  init();
})();
