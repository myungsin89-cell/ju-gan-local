/* =========================================================
   db.js  —  ju-gan-local 통합 데이터 레이어
   로컬 모드: localStorage  /  서버 모드: 사용자 Firebase
   ========================================================= */

// ── LocalDB ───────────────────────────────────────────────
const LocalDB = {
  _key(roomCode) {
    return `jugan-local-room-${roomCode}`;
  },

  async listRooms() {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('jugan-local-room-'));
    return keys.map(k => k.replace('jugan-local-room-', ''));
  },

  async createRoom(roomCode) {
    const key = this._key(roomCode);
    if (localStorage.getItem(key)) return false;
    const empty = {
      config: null,
      classSettings: {},
      specialists: [],
      referenceBoards: [],
      maxWeek: 1,
      lastSavedBy: '',
      lastSavedAt: new Date().toISOString(),
      history: {}
    };
    localStorage.setItem(key, JSON.stringify(empty));
    return true;
  },

  async load(roomCode) {
    const saved = localStorage.getItem(this._key(roomCode));
    if (!saved) return null;
    try {
      const data = JSON.parse(saved);
      // app.js는 classes[c][요일]이 반드시 배열이길 기대함.
      // {} 로 저장된 빈 반 데이터를 올바른 형식으로 정규화.
      const DAYS = ['월','화','수','목','금'];
      if (data.history) {
        Object.values(data.history).forEach(wData => {
          if (!wData.classes) wData.classes = {};
          Object.keys(wData.classes).forEach(k => {
            const cls = wData.classes[k];
            DAYS.forEach(d => { if (!Array.isArray(cls[d])) cls[d] = []; });
          });
          if (!wData.bgColors)          wData.bgColors = {};
          if (!wData.targets)           wData.targets = {};
          if (!wData.specialistCells)   wData.specialistCells = {};
          if (!wData.specialists)       wData.specialists = [];
        });
      }
      return data;
    } catch { return null; }
  },

  async saveAdmin(roomCode, state) {
    const existing = (await this.load(roomCode)) || {};
    const data = {
      ...existing,
      config: state.config || null,
      classSettings: state.classSettings || {},
      specialists: state.specialists || [],
      referenceBoards: state.referenceBoards || [],
      maxWeek: state.maxWeek || 1,
      lastSavedBy: state.userProfile?.name || '나',
      lastSavedAt: new Date().toISOString(),
      history: {}
    };
    for (let w = 1; w <= (state.maxWeek || 1); w++) {
      const wData = (state.history || {})[w];
      if (!wData) continue;
      data.history[w] = {
        targets: wData.targets || {},
        specialistTargets: wData.specialistTargets || {},
        specialistMemo: wData.specialistMemo || '',
        weeklyMemo: wData.weeklyMemo || '',
        specialistCells: wData.specialistCells || {},
        specialists: wData.specialists || [],
        classes: wData.classes || {},
        bgColors: wData.bgColors || {}
      };
    }
    localStorage.setItem(this._key(roomCode), JSON.stringify(data));
  },

  async saveClass(roomCode, classNum, state) {
    const existing = (await this.load(roomCode)) || {};
    if (!existing.history) existing.history = {};
    for (let w = 1; w <= (state.maxWeek || 1); w++) {
      const wData = (state.history || {})[w];
      if (!wData) continue;
      if (!existing.history[w]) existing.history[w] = {};
      if (!existing.history[w].classes) existing.history[w].classes = {};
      if (!existing.history[w].bgColors) existing.history[w].bgColors = {};
      existing.history[w].classes[classNum] = (wData.classes || {})[classNum] || {};
      existing.history[w].bgColors[classNum] = (wData.bgColors || {})[classNum] || {};
    }
    if (!existing.classSettings) existing.classSettings = {};
    existing.classSettings[classNum] = (state.classSettings || {})[classNum] || {};
    existing.lastSavedBy = state.userProfile?.name || '';
    existing.lastSavedAt = new Date().toISOString();
    localStorage.setItem(this._key(roomCode), JSON.stringify(existing));
  },

  async deleteRoom(roomCode) {
    localStorage.removeItem(this._key(roomCode));
  }
};

// ── Firebase 실제 구현체 (내부용) ─────────────────────────
const _FirebaseImpl = {
  db: null,

  init(config) {
    if (firebase.apps.length) {
      firebase.apps.forEach(app => app.delete());
    }
    firebase.initializeApp(config);
    this.db = firebase.firestore();
  },

  roomRef(roomCode) {
    return this.db.collection('rooms').doc(roomCode);
  },

  async listRooms() {
    const snap = await this.db.collection('rooms').get();
    return snap.docs.map(d => d.id);
  },

  async createRoom(roomCode) {
    const ref = this.roomRef(roomCode);
    const snap = await ref.get();
    if (snap.exists) return false;
    await ref.set({
      config: null,
      specialists: [],
      referenceBoards: [],
      maxWeek: 1,
      lastSavedBy: '',
      lastSavedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return true;
  },

  async load(roomCode) {
    const rRef = this.roomRef(roomCode);
    const roomSnap = await rRef.get();
    if (!roomSnap.exists) return null;

    const roomData = roomSnap.data();
    const history = {};
    const weeksSnap = await rRef.collection('weeks').get();

    await Promise.all(weeksSnap.docs.map(async weekDoc => {
      const w = parseInt(weekDoc.id);
      const wData = weekDoc.data();
      history[w] = {
        targets: wData.targets || {},
        specialistTargets: wData.specialistTargets || {},
        specialistMemo: wData.specialistMemo || '',
        weeklyMemo: wData.weeklyMemo || '',
        specialistCells: wData.specialistCells || {},
        specialists: wData.specialists || [],
        classes: {},
        bgColors: {}
      };
      const classesSnap = await rRef.collection('weeks').doc(weekDoc.id).collection('classes').get();
      classesSnap.docs.forEach(classDoc => {
        const cd = classDoc.data();
        history[w].classes[classDoc.id] = cd.timetable || {};
        history[w].bgColors[classDoc.id] = cd.bgColors || {};
      });
    }));

    return {
      config: roomData.config || null,
      classSettings: roomData.classSettings || {},
      specialists: roomData.specialists || [],
      referenceBoards: roomData.referenceBoards || [],
      maxWeek: roomData.maxWeek || 1,
      lastSavedBy: roomData.lastSavedBy || '',
      lastSavedAt: roomData.lastSavedAt || null,
      history
    };
  },

  async saveAdmin(roomCode, state) {
    const rRef = this.roomRef(roomCode);
    await rRef.set({
      ...this._clean({
        config: state.config,
        classSettings: state.classSettings || {},
        specialists: state.specialists || [],
        referenceBoards: state.referenceBoards || [],
        maxWeek: state.maxWeek,
        lastSavedBy: state.userProfile?.name || '관리자'
      }),
      lastSavedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    const saves = [];
    for (let w = 1; w <= state.maxWeek; w++) {
      const wData = (state.history || {})[w];
      if (!wData) continue;
      const wRef = rRef.collection('weeks').doc(String(w));
      saves.push(wRef.set(this._clean({
        targets: wData.targets || {},
        specialistTargets: wData.specialistTargets || {},
        specialistMemo: wData.specialistMemo || '',
        weeklyMemo: wData.weeklyMemo || '',
        specialistCells: wData.specialistCells || {},
        specialists: wData.specialists || []
      })));
      for (const [classNum, classData] of Object.entries(wData.classes || {})) {
        saves.push(
          wRef.collection('classes').doc(String(classNum)).set(this._clean({
            timetable: classData || {},
            bgColors: (wData.bgColors || {})[classNum] || {}
          }))
        );
      }
    }
    await Promise.all(saves);
  },

  async saveClass(roomCode, classNum, state) {
    const rRef = this.roomRef(roomCode);
    const saves = [];
    for (let w = 1; w <= state.maxWeek; w++) {
      const wData = (state.history || {})[w];
      if (!wData) continue;
      saves.push(
        rRef.collection('weeks').doc(String(w))
          .collection('classes').doc(String(classNum))
          .set(this._clean({
            timetable: (wData.classes || {})[classNum] || {},
            bgColors: ((wData.bgColors || {})[classNum]) || {}
          }))
      );
    }
    saves.push(
      rRef.set({ classSettings: { [classNum]: this._clean((state.classSettings || {})[classNum] || {}) } }, { merge: true })
    );
    await Promise.all(saves);
  },

  async deleteRoom(roomCode) {
    const rRef = this.roomRef(roomCode);
    const weeksSnap = await rRef.collection('weeks').get();
    const deletes = [];
    for (const weekDoc of weeksSnap.docs) {
      const classesSnap = await rRef.collection('weeks').doc(weekDoc.id).collection('classes').get();
      classesSnap.docs.forEach(cd => deletes.push(cd.ref.delete()));
      deletes.push(weekDoc.ref.delete());
    }
    await Promise.all(deletes);
    await rRef.delete();
  },

  _clean(obj) {
    return JSON.parse(JSON.stringify(obj, (k, v) => v === undefined ? null : v));
  }
};

// ── DB (프록시) ───────────────────────────────────────────
const DB = {
  _provider: null,
  mode: null,  // 'local' | 'server'

  setLocal() {
    this.mode = 'local';
    this._provider = LocalDB;
  },

  setServer(firebaseConfig) {
    this.mode = 'server';
    _FirebaseImpl.init(firebaseConfig);
    this._provider = _FirebaseImpl;
  },

  isReady() {
    return this._provider !== null;
  },

  async listRooms()                      { return this._provider.listRooms(); },
  async createRoom(roomCode)             { return this._provider.createRoom(roomCode); },
  async load(roomCode)                   { return this._provider.load(roomCode); },
  async saveAdmin(roomCode, state)       { return this._provider.saveAdmin(roomCode, state); },
  async saveClass(roomCode, classNum, s) { return this._provider.saveClass(roomCode, classNum, s); },
  async deleteRoom(roomCode)             { return this._provider.deleteRoom(roomCode); }
};

// ── FirebaseDB 호환 alias ─────────────────────────────────
// app.js가 수정 없이 동작하도록 FirebaseDB 이름을 DB 프록시에 연결.
// mode.js가 DB.setLocal() / DB.setServer()로 초기화하므로 init()은 no-op.
// _provider가 null(모드 미선택)일 때는 빈 값 반환해 앱이 멈추지 않게 함.
const FirebaseDB = {
  init() {},
  async load(r)           { return DB._provider ? DB.load(r) : null; },
  async saveAdmin(r, s)   { return DB._provider ? DB.saveAdmin(r, s) : null; },
  async saveClass(r, c, s){ return DB._provider ? DB.saveClass(r, c, s) : null; },
  async listRooms()       { return DB._provider ? DB.listRooms() : []; },
  async createRoom(r)     { return DB._provider ? DB.createRoom(r) : false; },
  async deleteRoom(r)     { return DB._provider ? DB.deleteRoom(r) : null; }
};
