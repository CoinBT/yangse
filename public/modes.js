(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch]);
  let state = null;
  let send = null;
  let draftTopics = {};
  let draftReply = '';
  let previousRoomMode = '';

  function picker(s) {
    if (!s.me.host) return '';
    return '<div class="mode-picker"><div class="mode-label">🎮 게임 모드 선택</div><div class="mode-buttons">' +
      '<button type="button" data-mode-select="classic" class="mode-choice ' + (s.gameMode === 'classic' ? 'selected' : '') + '">🎭 클래식<small>오른쪽 사람 주제 · 정답 자동 판정</small></button>' +
      '<button type="button" data-mode-select="host_show" class="mode-choice ' + (s.gameMode === 'host_show' ? 'selected' : '') + '">👑 Host Show!<small>호스트가 주제 지정 · 4바퀴 대결</small></button></div></div>';
  }

  function renderHostSetup(s, root) {
    const count = s.challengerCount;
    let html = picker(s) +
      '<div class="mission-box"><div class="mission-label">HOST SHOW! · PREPARE</div><div class="mission-name">👑 호스트 vs 도전자들</div>' +
      '<div class="mission-hint">호스트가 각 도전자의 비밀 주제를 설정하고, 질문에 답변해 주세요. 도전자 과반수가 4바퀴 안에 정답을 맞히면 도전자팀 승리! 그렇지 않으면 호스트 승리입니다.</div></div>';
    if (s.lastOutcome && s.lastOutcome.hostOutcome) {
      const result = s.lastOutcome.hostOutcome;
      html += '<div class="alert-slice purple">지난 Host Show! 결과: ' + (result.winnerSide === 'challengers' ? '🎊 도전자팀 승리' : result.winnerSide === 'host' ? '👑 호스트 승리' : '게임 중단') + '</div>';
    }
    if (s.me.host) {
      if (!count) html += '<div class="alert-slice purple">도전자 한 명 이상이 입장하면 주제를 지정할 수 있어요.</div>';
      for (const t of s.topicTargets) {
        const value = Object.prototype.hasOwnProperty.call(draftTopics, t.id) ? draftTopics[t.id] : t.text;
        html += '<div class="host-topic"><label for="mode-topic-' + esc(t.id) + '">' + esc(t.name) + '님의 정답 ' + (t.assigned ? '✅' : '⏳') + '</label>' +
          '<div class="host-topic-row"><input class="field" id="mode-topic-' + esc(t.id) + '" data-mode-topic-input="' + esc(t.id) + '" maxlength="50" placeholder="예: 피카츄, 손흥민" value="' + esc(value) + '">' +
          '<button type="button" class="btn btn-outline btn-small" data-host-topic-save="' + esc(t.id) + '">저장</button></div></div>';
      }
      html += '<div class="progress-caption"><span>주제 지정 완료</span><strong>' + s.readyCount + ' / ' + count + '</strong></div>';
      html += '<button type="button" class="btn btn-mint btn-wide" data-host-start ' + (s.canStart ? '' : 'disabled') + '>🚀 Host Show! 시작하기 →</button>';
      html += '<p class="note-small">' + (s.canStart ? '첫 도전자의 순서는 무작위로 결정됩니다.' : '도전자 전원이 온라인이고 비밀 주제가 준비되어야 시작할 수 있어요.') + '</p>';
      for (const p of s.people.filter(p => p.id !== s.hostId)) {
        // 참가자 강퇴는 왼쪽 관리 패널에서 진행합니다.
      }
    } else if (s.me.role === 'spectator') {
      html += '<div class="alert-slice purple">👀 관전 모드 — 도전자들의 주제는 비공개예요.</div>';
    } else {
      html += '<div class="alert-slice purple">🔒 호스트가 도전자별 비밀 주제를 지정하고 있어요. 본인의 주제는 공개되지 않아요.</div>';
    }
    root.innerHTML = html;
  }

  function renderHostPlay(s, root, actionDraft) {
    const current = s.people.find(p => p.id === s.turnId);
    const isMyTurn = s.turnId === s.me.id && s.me.role === 'player';
    const waiting = s.pending;
    const total = s.challengerCount || 1;
    const lap = Math.min(4, Math.floor(s.turnSteps / total) + 1);
    $('actionTitle').textContent = s.me.host ? '호스트의 답변석' : isMyTurn ? '내 차례!' : (current?.name || '도전자') + '님의 차례';
    $('actionIcon').textContent = s.me.host ? '👑' : '🎤';
    $('actionEyebrow').textContent = 'HOST SHOW! · ' + lap + ' / 4 바퀴';
    let html = '<div class="mission-box"><div class="mission-label">HOST SHOW! · ROUND ' + s.roundNo + '</div>' +
      '<div class="mission-name">👑 호스트 vs 도전자</div>' +
      '<div class="mission-hint">도전자 ' + s.winners.length + '/' + s.challengerCount + '명 정답 · 승리 조건 ' + s.threshold + '명 · 진행 ' + lap + '/4바퀴 (' + s.turnSteps + '/' + s.maxTurns + '칸)</div></div>';
    if (s.winners.length) html += '<div class="alert-slice purple">✅ 정답 완료: ' + s.winners.map(w => esc(w.name)).join(', ') + '</div>';
    if (!waiting && isMyTurn) {
      html += '<div class="mission-box"><div class="mission-name">내 비밀 주제를 추리해 보세요!</div><div class="mission-hint">질문은 호스트가 답변합니다. 정답을 직접 입력하면 서버에서 즉시 판정해요.</div></div>' +
        '<label for="actionText">질문 또는 예상 정답</label><input class="field" type="text" id="actionText" maxlength="100" placeholder="이곳에 질문 혹은 정답을 입력하고 엔터" value="' + esc(actionDraft || '') + '">' +
        '<div class="action-buttons"><button type="button" class="btn btn-outline" data-event="question">❔ 호스트에게 질문<small>답변 후 다음 차례</small></button>' +
        '<button type="button" class="btn btn-yellow" data-event="answer">✨ 정답 시도<small>자동 정답 / 오답</small></button></div>';
    } else if (waiting && waiting.type === 'question') {
      html += '<div class="mission-box"><div class="mission-label">QUESTION FOR HOST</div><div class="mission-name">❔ ' + esc(current?.name || '도전자') + '님의 질문</div>' +
        '<div class="alert-slice purple">' + esc(waiting.text || '음성 질문') + '</div></div>';
      if (s.me.host) html += '<label for="hostReplyText">호스트 답변</label><input class="field" type="text" id="hostReplyText" maxlength="150" placeholder="예 / 아니요 / 자세한 답변" value="' + esc(draftReply) + '">' +
        '<button type="button" class="btn btn-primary btn-wide" data-host-reply>💬 답변 후 다음 차례 →</button>';
      else html += '<div class="alert-slice purple">👑 호스트의 답변을 기다리고 있어요.</div>';
    } else if (s.me.host) {
      html += '<div class="alert-slice purple">호스트가 도전자들의 질문에 답변하는 모드예요. 도전자 차례를 기다려 주세요.</div>';
    } else {
      html += '<div class="mission-box"><div class="mission-name">' + esc(current?.name || '도전자') + '님 진행 중</div><div class="mission-hint">다음 차례를 기다려 주세요.</div></div>';
    }
    if (s.me.host) html += '<div class="host-controls"><button type="button" class="btn btn-outline btn-small" data-host-skip>⏭ 현재 차례 넘기기</button><button type="button" class="btn btn-danger btn-small" data-host-end>⏹ 게임 종료</button></div>';
    html += '<p class="note-small">Host Show! 결과는 지난 게임 기록에 남습니다. 점수는 클래식 모드에서만 부여됩니다.</p>';
    root.innerHTML = html;
    $('boardHint').textContent = '👑 ' + lap + '/4 바퀴 · 정답 ' + s.winners.length + '/' + s.threshold;
  }

  function renderHostGallery(s) {
    const gallery = $('topicGallery');
    if (!gallery || s.stage !== 'play') return;
    gallery.classList.remove('hidden');
    let text = '<div class="gallery-heading"><span>👑 Host Show! · 비밀 주제 (' + (s.me.host ? '호스트 전용 정답표' : '호스트만 정답 열람 가능') + ')</span></div><div class="gallery-items">';
    for (const person of s.people) {
      const subject = person.id === s.hostId ? '진행 호스트' : person.finished ? '✅ 정답 완료' : s.me.host ? (s.topics[person.id] || '주제 없음') : '🔒 비밀 주제';
      text += '<div class="gallery-card"><div class="gallery-name">' + esc(person.name) + '</div><div class="gallery-topic ' + (s.me.host ? '' : 'hidden-topic') + '">' + esc(subject) + '</div></div>';
    }
    gallery.innerHTML = text + '</div>';
  }

  function renderHistory(s) {
    const box = $('historyContent');
    if (!s.history.some(h => h.hostOutcome)) return;
    box.innerHTML = s.history.map(h => {
      const result = h.hostOutcome;
      let detail = '';
      if (result) {
        const side = result.winnerSide === 'challengers' ? '🎊 도전자 승리' : result.winnerSide === 'host' ? '👑 호스트 승리' : '⏹ 중단';
        detail = side + ' · 정답 ' + result.correctCount + '/' + result.required + '명 · ' + result.lapsUsed + '/4바퀴';
      } else detail = h.winners.length ? h.winners.map(w => esc(w.name) + ' +' + w.points + '점').join(', ') : '정답자 없음';
      return '<div class="history-item"><span class="history-id">#' + h.round + '</span><div><div class="history-meta">' + (h.mode === 'host_show' ? 'Host Show!' : '클래식') + '</div><div class="history-info">' + detail + '</div></div></div>';
    }).join('');
  }

  function render(s, act, actionDraft) {
    state = s; send = act;
    const root = $('actionContent');
    if (!root) return;
    if (previousRoomMode !== s.code + ':' + s.gameMode + ':' + s.category) {
      draftTopics = {}; draftReply = '';
      previousRoomMode = s.code + ':' + s.gameMode + ':' + s.category;
    }
    if (s.stage === 'setup') {
      if (s.gameMode === 'host_show') {
        $('actionTitle').textContent = '상대 문제 정하기';
        $('actionIcon').textContent = '👑';
        renderHostSetup(s, root);
        $('boardHint').textContent = '호스트가 각 도전자에게 주제 지정';
        const centerInfo = $('boardCenter')?.querySelector('.center-info');
        if (centerInfo) centerInfo.textContent = s.readyCount + ' / ' + s.challengerCount + '명 주제 지정';
      } else if (s.me.host) root.insertAdjacentHTML('afterbegin', picker(s));
    } else if (s.gameMode === 'host_show') {
      renderHostPlay(s, root, actionDraft);
      renderHostGallery(s);
    } else {
      const label = root.querySelector('[data-event="answer"] small');
      if (label) label.textContent = '자동 정답 / 오답 판정';
      const field = root.querySelector('#actionText');
      if (field) field.placeholder = '이곳에 질문 혹은 정답을 입력하고 엔터';
    }
    renderHistory(s);
    $('phaseBadge').textContent = s.stage === 'setup' ? (s.gameMode === 'host_show' ? '👑 Host Show! 준비' : '✏️ 클래식 준비') : (s.gameMode === 'host_show' ? '👑 Host Show! 진행 중' : '🎭 클래식 진행 중');
    $('roomSubtitle').textContent = s.gameMode === 'host_show' ? '호스트가 주제를 정하고 답변해요! 4바퀴 안에 도전자 과반수가 맞히면 승리.' : (s.stage === 'setup' ? '오른쪽 사람의 주제를 정해 주세요.' : '순서대로 질문하고 정답을 입력하면 자동 판정해요.');
  }

  document.addEventListener('input', e => {
    if (e.target.dataset.modeTopicInput) draftTopics[e.target.dataset.modeTopicInput] = e.target.value;
    if (e.target.id === 'hostReplyText') draftReply = e.target.value;
  });
  document.addEventListener('click', e => {
    if (!send || !state) return;
    const b = e.target.closest('[data-mode-select],[data-host-topic-save],[data-host-start],[data-host-reply],[data-host-skip],[data-host-end],[data-host-remove]');
    if (!b || b.disabled) return;
    if (b.dataset.modeSelect) {
      if (b.dataset.modeSelect !== state.gameMode) send('set_mode', { mode: b.dataset.modeSelect });
    } else if (b.dataset.hostTopicSave) {
      const targetId = b.dataset.hostTopicSave;
      const text = ($( 'mode-topic-' + targetId)?.value || '').trim();
      if (!text) return window.alert('비밀 주제를 입력해 주세요.');
      send('set_topic', { targetId, topic: text });
    } else if (b.hasAttribute('data-host-start')) send('start');
    else if (b.hasAttribute('data-host-reply')) {
      const reply = $('hostReplyText')?.value.trim();
      if (!reply) return window.alert('호스트 답변을 입력해 주세요.');
      send('host_reply', { reply }); draftReply = '';
    } else if (b.hasAttribute('data-host-skip')) send('host_skip');
    else if (b.hasAttribute('data-host-end')) {
      if (window.confirm('Host Show! 게임을 중단할까요?')) send('end_round');
    } else if (b.dataset.hostRemove) {
      if (window.confirm('해당 도전자를 내보낼까요?')) send('remove_player', { userId: b.dataset.hostRemove });
    }
  });
  window.YSMode = { render };
})();