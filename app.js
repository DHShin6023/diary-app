/* ── App ── */
const App = {
  view: 'calendar',
  calDate: new Date(),
  currentEntry: null,
  editingId: null,
  editorDate: '',
  selectedMood: null,
  photos: [],
  tags: [],

  /* ── Init ── */
  async init() {
    await DB.init();
    this.bindEvents();
    Pin.bindEvents();
    // Set initial header state
    document.getElementById('btnBack').classList.add('hidden');
    document.getElementById('btnMore').classList.add('hidden');
    await this.renderCalendar();
    await this.renderRecent();
    // 앱 시작 시 PIN 잠금
    Pin.show('unlock', false);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  },

  /* ── Events ── */
  bindEvents() {
    // Nav
    document.getElementById('navCalendar').addEventListener('click', () => this.showView('calendar'));
    document.getElementById('navList').addEventListener('click', () => this.showView('list'));
    document.getElementById('navWrite').addEventListener('click', () => this.openEditor());

    // Header
    document.getElementById('btnBack').addEventListener('click', () => this.goBack());
    document.getElementById('btnMore').addEventListener('click', () => this.toggleCtx());

    // Calendar
    document.getElementById('btnPrevMonth').addEventListener('click', () => this.changeMonth(-1));
    document.getElementById('btnNextMonth').addEventListener('click', () => this.changeMonth(1));

    // Editor
    document.getElementById('moodGrid').addEventListener('click', e => {
      const btn = e.target.closest('.mood-btn');
      if (btn) this.pickMood(btn.dataset.mood, btn);
    });
    document.getElementById('photoInput').addEventListener('change', e => this.addPhotos(e));
    document.getElementById('tagInput').addEventListener('keydown', e => this.handleTagKey(e));
    document.getElementById('btnSave').addEventListener('click', () => this.save());

    // Search
    document.getElementById('searchInput').addEventListener('input', e => this.search(e.target.value));
    document.getElementById('btnClearSearch').addEventListener('click', () => {
      document.getElementById('searchInput').value = '';
      document.getElementById('btnClearSearch').classList.remove('visible');
      this.search('');
    });

    // Context menu
    document.getElementById('btnEdit').addEventListener('click', () => { this.closeCtx(); this.editEntry(); });
    document.getElementById('btnDelete').addEventListener('click', () => { this.closeCtx(); this.showConfirm(); });
    document.getElementById('ctxOverlay').addEventListener('click', () => this.closeCtx());

    // Confirm dialog
    document.getElementById('confirmOk').addEventListener('click', () => this.deleteEntry());
    document.getElementById('confirmCancel').addEventListener('click', () => this.closeConfirm());
    document.getElementById('confirmBg').addEventListener('click', () => this.closeConfirm());

    // Photo modal
    document.getElementById('modalBg').addEventListener('click', () => this.closeModal());
    document.getElementById('modalClose').addEventListener('click', () => this.closeModal());
  },

  /* ── View switching ── */
  showView(name) {
    ['calendar','list','editor','detail'].forEach(v => {
      document.getElementById('view' + cap(v)).classList.remove('active');
    });
    document.getElementById('view' + cap(name)).classList.add('active');
    this.view = name;

    const isSubView = name === 'editor' || name === 'detail';
    const nav = document.getElementById('bottomNav');
    const main = document.querySelector('.main-content');
    nav.style.display = isSubView ? 'none' : 'flex';
    main.style.paddingBottom = isSubView ? '0' : '';

    document.getElementById('btnBack').classList.toggle('hidden', !isSubView);
    document.getElementById('btnMore').classList.toggle('hidden', name !== 'detail');

    const titles = { calendar: '나의 일기', list: '모든 일기', editor: this.editingId ? '일기 수정' : '일기 쓰기', detail: '' };
    document.getElementById('headerTitle').textContent = titles[name] ?? '';

    document.querySelectorAll('.nav-btn[data-view]').forEach(b => {
      b.classList.toggle('active', b.dataset.view === name);
    });

    if (name === 'list') this.renderAll();
  },

  goBack() {
    if (this.view === 'editor' || this.view === 'detail') {
      this.showView('calendar');
    }
  },

  /* ── Calendar ── */
  async renderCalendar() {
    const y = this.calDate.getFullYear();
    const m = this.calDate.getMonth();
    document.getElementById('calMonthLabel').textContent = `${y}년 ${m + 1}월`;

    const monthMap = await DB.getMonthEntries(y, m + 1);
    const firstDow = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const todayStr = fmtDate(new Date());
    const grid = document.getElementById('calGrid');
    grid.innerHTML = '';

    for (let i = 0; i < firstDow; i++) {
      const el = document.createElement('div');
      el.className = 'cal-day empty';
      grid.appendChild(el);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${y}-${pad(m + 1)}-${pad(d)}`;
      const dow = new Date(y, m, d).getDay();
      const el = document.createElement('div');
      el.className = 'cal-day';
      if (dow === 0) el.classList.add('sun');
      if (dow === 6) el.classList.add('sat');
      if (ds === todayStr) el.classList.add('today');

      const numEl = document.createElement('span');
      numEl.className = 'cal-day-num';
      numEl.textContent = d;
      el.appendChild(numEl);

      if (monthMap[ds]) {
        const moodEl = document.createElement('span');
        moodEl.className = 'cal-day-mood';
        moodEl.textContent = monthMap[ds];
        el.appendChild(moodEl);
      }

      el.addEventListener('click', () => this.dayTap(ds));
      grid.appendChild(el);
    }
  },

  async dayTap(ds) {
    const entries = await DB.getByDate(ds);
    if (entries.length > 0) {
      this.showDetail(entries[0]);
    } else {
      this.openEditor(ds);
    }
  },

  changeMonth(delta) {
    this.calDate.setMonth(this.calDate.getMonth() + delta);
    this.renderCalendar();
  },

  /* ── Recent ── */
  async renderRecent() {
    const entries = await DB.getAll();
    const el = document.getElementById('recentList');
    if (entries.length === 0) {
      el.innerHTML = '<p style="color:var(--txt3);font-size:14px;text-align:center;padding:24px 0;">아직 작성한 일기가 없어요 ✏️</p>';
      return;
    }
    el.innerHTML = '';
    entries.slice(0, 5).forEach(e => el.appendChild(this.makeCard(e)));
  },

  /* ── All Entries ── */
  async renderAll(q = '') {
    const all = await DB.getAll();
    const el = document.getElementById('allList');
    const empty = document.getElementById('emptyState');
    const list = q ? all.filter(e =>
      (e.title || '').toLowerCase().includes(q.toLowerCase()) ||
      (e.content || '').toLowerCase().includes(q.toLowerCase()) ||
      (e.tags || []).some(t => t.toLowerCase().includes(q.toLowerCase()))
    ) : all;

    el.innerHTML = '';
    if (list.length === 0) {
      empty.classList.add('visible');
    } else {
      empty.classList.remove('visible');
      list.forEach(e => el.appendChild(this.makeCard(e)));
    }
  },

  makeCard(entry) {
    const card = document.createElement('div');
    card.className = 'entry-card';
    const d = new Date(entry.date + 'T00:00:00');
    const dateStr = d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
    const title = entry.title || dateStr;
    const preview = (entry.content || '').slice(0, 70) + ((entry.content || '').length > 70 ? '…' : '');
    const hasPhotos = entry.photos?.length > 0;
    const firstTag = entry.tags?.[0];

    card.innerHTML = `
      <div class="ec-mood">${entry.mood || '📓'}</div>
      <div class="ec-body">
        <div class="ec-title">${esc(title)}</div>
        <div class="ec-preview">${esc(preview) || '<span style="color:var(--txt3)">내용 없음</span>'}</div>
        <div class="ec-meta">
          <span class="ec-date">${dateStr}</span>
          ${hasPhotos ? `<span class="ec-photo-badge">📷 ${entry.photos.length}</span>` : ''}
          ${firstTag ? `<span class="ec-tag">#${esc(firstTag)}</span>` : ''}
        </div>
      </div>`;
    card.addEventListener('click', () => this.showDetail(entry));
    return card;
  },

  /* ── Editor ── */
  openEditor(ds = null) {
    this.editingId = null;
    this.photos = [];
    this.tags = [];
    this.selectedMood = null;
    this.editorDate = ds || fmtDate(new Date());

    const d = new Date(this.editorDate + 'T00:00:00');
    document.getElementById('editorDateLabel').textContent =
      d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

    document.getElementById('editorTitle').value = '';
    document.getElementById('editorContent').value = '';
    document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('sel'));
    this.renderPhotoList();
    this.renderTagRow();
    this.showView('editor');
  },

  editEntry() {
    const e = this.currentEntry;
    if (!e) return;
    this.editingId = e.id;
    this.photos = [...(e.photos || [])];
    this.tags = [...(e.tags || [])];
    this.selectedMood = e.mood || null;
    this.editorDate = e.date;

    const d = new Date(e.date + 'T00:00:00');
    document.getElementById('editorDateLabel').textContent =
      d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

    document.getElementById('editorTitle').value = e.title || '';
    document.getElementById('editorContent').value = e.content || '';

    document.querySelectorAll('.mood-btn').forEach(b => {
      b.classList.toggle('sel', b.dataset.mood === e.mood);
    });

    this.renderPhotoList();
    this.renderTagRow();
    this.showView('editor');
  },

  pickMood(mood, btn) {
    document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('sel'));
    btn.classList.add('sel');
    this.selectedMood = mood;
  },

  addPhotos(e) {
    Array.from(e.target.files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = ev => {
        this.photos.push(ev.target.result);
        this.renderPhotoList();
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  },

  renderPhotoList() {
    const list = document.getElementById('editorPhotoList');
    list.innerHTML = '';
    this.photos.forEach((src, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'thumb-wrap';
      wrap.innerHTML = `<img src="${src}" class="thumb" alt="사진"><button class="btn-rm-photo" aria-label="사진 삭제">✕</button>`;
      wrap.querySelector('img').addEventListener('click', () => this.openModal(src));
      wrap.querySelector('.btn-rm-photo').addEventListener('click', () => {
        this.photos.splice(i, 1);
        this.renderPhotoList();
      });
      list.appendChild(wrap);
    });
  },

  handleTagKey(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const v = e.target.value.trim().replace(/^#/, '');
      if (v && !this.tags.includes(v)) { this.tags.push(v); this.renderTagRow(); }
      e.target.value = '';
    }
  },

  renderTagRow() {
    const row = document.getElementById('editorTagsRow');
    const input = document.getElementById('tagInput');
    row.innerHTML = '';
    this.tags.forEach((tag, i) => {
      const b = document.createElement('span');
      b.className = 'tag-badge';
      b.innerHTML = `#${esc(tag)}<button class="tag-rm" aria-label="태그 삭제">✕</button>`;
      b.querySelector('.tag-rm').addEventListener('click', () => {
        this.tags.splice(i, 1);
        this.renderTagRow();
      });
      row.appendChild(b);
    });
    row.appendChild(input);
  },

  async save() {
    const title = document.getElementById('editorTitle').value.trim();
    const content = document.getElementById('editorContent').value.trim();

    if (!content && !title) { this.toast('내용을 입력해주세요'); return; }

    let createdAt = Date.now();
    if (this.editingId) {
      const orig = await DB.getById(this.editingId);
      if (orig) createdAt = orig.createdAt;
    }

    const entry = {
      id: this.editingId || Date.now().toString(),
      date: this.editorDate,
      title, content,
      mood: this.selectedMood,
      photos: [...this.photos],
      tags: [...this.tags],
      createdAt,
      updatedAt: Date.now()
    };

    await DB.save(entry);
    this.toast(this.editingId ? '일기를 수정했어요 ✏️' : '일기를 저장했어요 ✨');

    await this.renderCalendar();
    await this.renderRecent();
    this.showDetail(entry);
  },

  /* ── Detail ── */
  showDetail(entry) {
    this.currentEntry = entry;
    const d = new Date(entry.date + 'T00:00:00');
    const dateStr = d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

    document.getElementById('detailMood').textContent = entry.mood || '📓';
    document.getElementById('detailTitle').textContent = entry.title || dateStr;
    document.getElementById('detailDate').textContent = entry.title ? dateStr : '';
    document.getElementById('detailBody').textContent = entry.content || '';

    const photosEl = document.getElementById('detailPhotos');
    photosEl.innerHTML = '';
    (entry.photos || []).forEach(src => {
      const img = document.createElement('img');
      img.src = src; img.alt = '사진';
      img.addEventListener('click', () => this.openModal(src));
      photosEl.appendChild(img);
    });

    const tagsEl = document.getElementById('detailTags');
    tagsEl.innerHTML = '';
    (entry.tags || []).forEach(tag => {
      const b = document.createElement('span');
      b.className = 'tag-badge';
      b.textContent = `#${tag}`;
      tagsEl.appendChild(b);
    });

    this.showView('detail');
  },

  async deleteEntry() {
    if (!this.currentEntry) return;
    await DB.delete(this.currentEntry.id);
    this.closeConfirm();
    this.toast('일기를 삭제했어요');
    await this.renderCalendar();
    await this.renderRecent();
    this.showView('calendar');
  },

  /* ── Context menu ── */
  toggleCtx() {
    const open = document.getElementById('ctxMenu').classList.contains('open');
    if (open) this.closeCtx(); else this.openCtx();
  },
  openCtx() {
    document.getElementById('ctxMenu').classList.add('open');
    document.getElementById('ctxOverlay').classList.add('open');
  },
  closeCtx() {
    document.getElementById('ctxMenu').classList.remove('open');
    document.getElementById('ctxOverlay').classList.remove('open');
  },

  /* ── Confirm ── */
  showConfirm() { document.getElementById('confirmModal').classList.add('open'); },
  closeConfirm() { document.getElementById('confirmModal').classList.remove('open'); },

  /* ── Search ── */
  search(q) {
    document.getElementById('btnClearSearch').classList.toggle('visible', q.length > 0);
    this.renderAll(q);
  },

  /* ── Photo modal ── */
  openModal(src) {
    document.getElementById('modalImg').src = src;
    document.getElementById('photoModal').classList.add('open');
  },
  closeModal() {
    document.getElementById('photoModal').classList.remove('open');
    document.getElementById('modalImg').src = '';
  },

  /* ── Toast ── */
  toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }
};

/* ── PIN Manager ── */
const Pin = {
  KEY: 'diaryPin',
  DEFAULT: '6023',
  // mode: 'unlock' | 'change-cur' | 'change-new' | 'change-confirm'
  mode: 'unlock',
  input: '',
  newPin: '',

  get() { return localStorage.getItem(this.KEY) || this.DEFAULT; },
  set(v) { localStorage.setItem(this.KEY, v); },

  show(mode, cancelable = false) {
    this.mode = mode;
    this.input = '';
    this.newPin = '';
    this._updateLabel();
    this._renderDots();
    document.getElementById('pinError').textContent = '';
    document.getElementById('pinCancelBtn').style.display = cancelable ? 'block' : 'none';
    document.getElementById('pinOverlay').classList.remove('hidden');
  },

  hide() {
    document.getElementById('pinOverlay').classList.add('hidden');
  },

  _labels: {
    'unlock':          '비밀번호를 입력해주세요',
    'change-cur':      '현재 비밀번호를 입력해주세요',
    'change-new':      '새 비밀번호를 입력해주세요',
    'change-confirm':  '새 비밀번호를 한 번 더 입력해주세요'
  },

  _updateLabel() {
    document.getElementById('pinLabel').textContent = this._labels[this.mode];
  },

  press(n) {
    if (this.input.length >= 4) return;
    this.input += n;
    this._renderDots();
    if (this.input.length === 4) setTimeout(() => this._submit(), 120);
  },

  del() {
    this.input = this.input.slice(0, -1);
    this._renderDots();
  },

  _renderDots() {
    document.querySelectorAll('.pin-dot').forEach((dot, i) => {
      dot.classList.toggle('filled', i < this.input.length);
      dot.classList.remove('err');
    });
  },

  _submit() {
    const pin = this.input;
    this.input = '';

    if (this.mode === 'unlock') {
      if (pin === this.get()) {
        this.hide();
      } else {
        this._error('비밀번호가 틀렸어요');
      }

    } else if (this.mode === 'change-cur') {
      if (pin === this.get()) {
        this.mode = 'change-new';
        this._updateLabel();
        document.getElementById('pinError').textContent = '';
        this._renderDots();
      } else {
        this._error('현재 비밀번호가 틀렸어요');
      }

    } else if (this.mode === 'change-new') {
      this.newPin = pin;
      this.mode = 'change-confirm';
      this._updateLabel();
      document.getElementById('pinError').textContent = '';
      this._renderDots();

    } else if (this.mode === 'change-confirm') {
      if (pin === this.newPin) {
        this.set(pin);
        this.hide();
        App.toast('비밀번호를 변경했어요 🔒');
      } else {
        this._error('비밀번호가 일치하지 않아요');
        // 새 비밀번호 단계로 되돌아가기
        setTimeout(() => {
          this.mode = 'change-new';
          this.newPin = '';
          this.input = '';
          this._updateLabel();
          document.getElementById('pinError').textContent = '';
          this._renderDots();
        }, 650);
      }
    }

    this._renderDots();
  },

  _error(msg) {
    document.getElementById('pinError').textContent = msg;
    const dots = document.getElementById('pinDots');
    document.querySelectorAll('.pin-dot').forEach(d => {
      d.classList.add('filled', 'err');
    });
    dots.classList.add('shake');
    setTimeout(() => {
      dots.classList.remove('shake');
      this._renderDots();
    }, 600);
  },

  bindEvents() {
    // 숫자 버튼
    document.querySelectorAll('.np-btn[data-n]').forEach(btn => {
      btn.addEventListener('click', () => this.press(btn.dataset.n));
    });
    // 지우기
    document.getElementById('pinDel').addEventListener('click', () => this.del());
    // 취소 (비밀번호 변경 시)
    document.getElementById('pinCancelBtn').addEventListener('click', () => this.hide());
    // 비밀번호 변경 열기
    document.getElementById('btnChangePinOpen').addEventListener('click', () => {
      this.show('change-cur', true);
    });
    // 백그라운드 복귀 시 잠금
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.show('unlock', false);
      }
    });
  }
};

/* ── Helpers ── */
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function pad(n) { return String(n).padStart(2, '0'); }
function fmtDate(d) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function esc(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

document.addEventListener('DOMContentLoaded', () => App.init());
