/* =========================================================
   mode.js  —  모드 선택 및 초기화
   ① 페이지 로드 시: 저장된 모드 읽어서 DB 준비
   ② 모드 선택 후: localStorage 저장 → location.reload()
   ========================================================= */

const MODE_KEY      = 'jugan-app-mode';
const FB_CONFIG_KEY = 'jugan-firebase-config';
const LOCAL_ROOM    = 'MY_LOCAL_ROOM';

window._appMode = null;

// ── 로컬 모드: 항상 관리자 유지 (saveData 패치) ──────────────
document.addEventListener('DOMContentLoaded', function () {
  if (window._appMode !== 'local') return;
  try {
    const _origSave = App.saveData;
    App.saveData = function () {
      if (this.state) this.state.isAdmin = true;
      _origSave.call(this);
    };
  } catch (e) {}
});

// ── 페이지 로드 시 초기화 ─────────────────────────────────
(function initMode() {
  const savedMode = localStorage.getItem(MODE_KEY);

  if (!savedMode) {
    document.body.classList.add('mode-selecting');
    const el = document.getElementById('mode-overlay');
    if (el) el.classList.remove('hide');
    return;
  }

  if (savedMode === 'local') {
    window._appMode = 'local';
    document.body.classList.add('local-mode');
    DB.setLocal();
    _ensureLocalRoom();
    return;
  }

  if (savedMode === 'server') {
    window._appMode = 'server';
    document.body.classList.add('server-mode');
    const raw = localStorage.getItem(FB_CONFIG_KEY);
    if (!raw) {
      document.body.classList.add('mode-selecting');
      const el = document.getElementById('firebase-config-overlay');
      if (el) el.classList.remove('hide');
      return;
    }
    try {
      DB.setServer(JSON.parse(raw));
    } catch {
      localStorage.removeItem(FB_CONFIG_KEY);
      document.body.classList.add('mode-selecting');
      const el = document.getElementById('firebase-config-overlay');
      if (el) el.classList.remove('hide');
    }
  }
})();

// ── 로컬 기본 방 보장 및 자동 프로필 설정 ─────────────────
function _ensureLocalRoom() {
  const key = `jugan-local-room-${LOCAL_ROOM}`;
  if (!localStorage.getItem(key)) {
    localStorage.setItem(key, JSON.stringify({
      config: null, classSettings: {}, specialists: [],
      referenceBoards: [], maxWeek: 1,
      lastSavedBy: '', lastSavedAt: new Date().toISOString(),
      history: {}
    }));
  }
  try {
    const plannerKey = 'school-planner-v4';
    const state = JSON.parse(localStorage.getItem(plannerKey) || '{}');
    let changed = false;
    if (state.roomCode !== LOCAL_ROOM) { state.roomCode = LOCAL_ROOM; changed = true; }
    if (!state.userProfile) {
      state.userProfile = { name: '선생님', classNum: 1, isSpecialist: false };
      changed = true;
    }
    if (!state.isAdmin) { state.isAdmin = true; changed = true; }
    if (changed) localStorage.setItem(plannerKey, JSON.stringify(state));
  } catch {}
}

// ══════════════════════════════════════════════════════════
// 모드 선택 오버레이 버튼 핸들러
// ══════════════════════════════════════════════════════════
function selectMode(mode) {
  if (mode === 'local') {
    localStorage.setItem(MODE_KEY, 'local');
    _ensureLocalRoom();
    location.reload();
  } else {
    localStorage.setItem(MODE_KEY, 'server');
    document.getElementById('mode-overlay').classList.add('hide');
    document.getElementById('firebase-config-overlay').classList.remove('hide');
  }
}

// ══════════════════════════════════════════════════════════
// Firebase 설정 오버레이 탭 전환
// ══════════════════════════════════════════════════════════
function switchFbTab(tab) {
  document.getElementById('fb-tab-admin').classList.toggle('fb-tab-active', tab === 'admin');
  document.getElementById('fb-tab-guest').classList.toggle('fb-tab-active', tab === 'guest');
  document.getElementById('fb-panel-admin').classList.toggle('hide', tab !== 'admin');
  document.getElementById('fb-panel-guest').classList.toggle('hide', tab !== 'guest');
  // 에러 메시지 초기화
  document.getElementById('fb-admin-error').classList.add('hide');
  document.getElementById('fb-guest-error').classList.add('hide');
}

// ══════════════════════════════════════════════════════════
// 관리자: Firebase 설정 저장 (전체 코드 붙여넣기 지원)
// ══════════════════════════════════════════════════════════
function saveFirebaseConfig() {
  const raw   = document.getElementById('fb-config-input').value.trim();
  const errEl = document.getElementById('fb-admin-error');
  errEl.classList.add('hide');

  // Firebase 콘솔에서 전체 복사한 경우 firebaseConfig 객체만 추출
  let source = raw;
  const snippetMatch = raw.match(/const\s+firebaseConfig\s*=\s*(\{[\s\S]*?\});/);
  if (snippetMatch) source = snippetMatch[1];

  let config;
  try { config = JSON.parse(source); }
  catch {
    try { config = Function('"use strict";return(' + source + ')')(); }
    catch {
      errEl.textContent = '형식 오류: Firebase 콘솔에서 복사한 설정을 그대로 붙여넣어 주세요.';
      errEl.classList.remove('hide');
      return;
    }
  }
  if (!config.apiKey || !config.projectId) {
    errEl.textContent = 'apiKey와 projectId가 필요합니다.';
    errEl.classList.remove('hide');
    return;
  }

  localStorage.setItem(FB_CONFIG_KEY, JSON.stringify(config));
  location.reload();
}

// ══════════════════════════════════════════════════════════
// 동료 선생님: 공유 코드로 참여
// ══════════════════════════════════════════════════════════
function saveShareCode() {
  const raw   = document.getElementById('fb-share-code-input').value.trim();
  const errEl = document.getElementById('fb-guest-error');
  errEl.classList.add('hide');

  if (!raw.startsWith('JUGAN-')) {
    errEl.textContent = '올바른 공유 코드가 아닙니다. 관리자에게 다시 받아서 붙여넣으세요.';
    errEl.classList.remove('hide');
    return;
  }

  let decoded;
  try { decoded = atob(raw.slice(6)); }
  catch {
    errEl.textContent = '공유 코드가 손상되었습니다. 관리자에게 다시 받으세요.';
    errEl.classList.remove('hide');
    return;
  }

  let config;
  try { config = JSON.parse(decoded); }
  catch {
    errEl.textContent = '공유 코드 내용을 읽을 수 없습니다. 관리자에게 다시 받으세요.';
    errEl.classList.remove('hide');
    return;
  }

  if (!config.apiKey || !config.projectId) {
    errEl.textContent = '공유 코드가 올바르지 않습니다.';
    errEl.classList.remove('hide');
    return;
  }

  localStorage.setItem(FB_CONFIG_KEY, JSON.stringify(config));
  location.reload();
}

// ══════════════════════════════════════════════════════════
// 공유 코드 생성 및 복사 (관리자용)
// ══════════════════════════════════════════════════════════
function generateShareCode() {
  const raw = localStorage.getItem(FB_CONFIG_KEY);
  if (!raw) return null;
  return 'JUGAN-' + btoa(raw);
}

function copyShareCode() {
  const code = generateShareCode();
  if (!code) return;
  const btn = document.getElementById('btn-copy-share-code');

  navigator.clipboard.writeText(code).then(() => {
    if (btn) { btn.textContent = '✅ 복사됨!'; setTimeout(() => { btn.textContent = '공유 코드 복사'; }, 2500); }
  }).catch(() => {
    // 클립보드 API 미지원 환경 대비
    const input = document.getElementById('share-code-display');
    if (input) { input.select(); document.execCommand('copy'); }
    if (btn) { btn.textContent = '✅ 복사됨!'; setTimeout(() => { btn.textContent = '공유 코드 복사'; }, 2500); }
  });
}

// ══════════════════════════════════════════════════════════
// 모드 초기화 (확인 후 실행)
// ══════════════════════════════════════════════════════════
function resetMode() {
  if (!confirm('앱 모드를 초기화하면 Firebase 연결 설정이 삭제됩니다.\n저장된 데이터는 유지됩니다.\n\n계속하시겠습니까?')) return;
  localStorage.removeItem(MODE_KEY);
  localStorage.removeItem(FB_CONFIG_KEY);
  location.reload();
}

// ══════════════════════════════════════════════════════════
// 앱 로드 후 헤더 배지 및 설정 화면 업데이트
// ══════════════════════════════════════════════════════════
window.addEventListener('load', function () {
  const badge     = document.getElementById('local-mode-badge');
  const modeBadge = document.getElementById('current-mode-badge');

  if (window._appMode === 'local') {
    if (badge) badge.classList.add('hide');
    if (modeBadge) { modeBadge.textContent = '💻 로컬 모드'; modeBadge.className = 'mode-badge mode-badge-local'; }
  } else if (window._appMode === 'server') {
    if (modeBadge) { modeBadge.textContent = '🌐 서버 모드'; modeBadge.className = 'mode-badge mode-badge-server'; }

    // 공유 코드 섹션 표시
    const shareSection = document.getElementById('share-code-section');
    const shareDisplay = document.getElementById('share-code-display');
    if (shareSection && shareDisplay) {
      const code = generateShareCode();
      if (code) {
        shareDisplay.value = code;
        shareSection.classList.remove('hide');
      }
    }
  }

  // PIN 기본값 경고
  try {
    const plannerKey = 'school-planner-v4';
    const state = JSON.parse(localStorage.getItem(plannerKey) || '{}');
    const pin = state.config && state.config.adminPin;
    const warning = document.getElementById('pin-default-warning');
    if (warning && (!pin || pin === '0000')) {
      warning.classList.remove('hide');
    }
  } catch {}
});
