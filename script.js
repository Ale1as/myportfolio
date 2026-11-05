// ---------- Screens: show one at a time ----------
// Clicks are handled directly (no browser navigation), so it works even inside previews;
// the hash is only a bonus for refresh/deep links.
const links = document.querySelectorAll('.sidebar nav a');
const screens = document.querySelectorAll('main section');

function show(id) {
  if (![...screens].some(sec => sec.id === id)) id = 'home';
  screens.forEach(sec => sec.classList.toggle('active', sec.id === id));
  links.forEach(a => a.classList.toggle('active', a.dataset.screen === id));
  window.scrollTo(0, 0);
}

links.forEach(a => {
  a.dataset.screen = a.getAttribute('href').slice(1);
  a.addEventListener('click', e => {
    e.preventDefault();
    show(a.dataset.screen);
    try { history.replaceState(null, '', '#' + a.dataset.screen); } catch (err) {}
  });
});

show(location.hash.slice(1));

// ---------- One entrance moment on first load ----------
document.body.classList.add('intro');
setTimeout(() => document.body.classList.remove('intro'), 1500);

// ---------- Music: only one track plays at a time, and the playing one is highlighted ----------
const audios = document.querySelectorAll('audio');
audios.forEach(a => {
  a.addEventListener('play', () => {
    audios.forEach(other => { if (other !== a) other.pause(); });
    a.closest('.entry').classList.add('playing');
  });
  ['pause', 'ended'].forEach(ev =>
    a.addEventListener(ev, () => a.closest('.entry').classList.remove('playing'))
  );
});

// ---------- Ripple + tiny vibration (on phones) when pressing buttons and nav links ----------
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

document.querySelectorAll('.sidebar a, .btn, .links a').forEach(el => {
  el.addEventListener('pointerdown', e => {
    if (navigator.vibrate) navigator.vibrate(8);
    if (reduceMotion) return;
    const r = el.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2;
    const dot = document.createElement('span');
    dot.className = 'ripple';
    dot.style.cssText =
      `width:${size}px;height:${size}px;` +
      `left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    el.appendChild(dot);
    dot.addEventListener('animationend', () => dot.remove());
  });
});

// ---------- Sidebar music player (drives the <audio> tags in the Music section) ----------
(function () {
  const SOUNDCLOUD_PROFILE = 'https://soundcloud.com/samarth-ale';   // fallback link
  const ICON = {
    play:  '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>'
  };

  const player = document.getElementById('player');
  const tracks = [...document.querySelectorAll('#music .entry')]
    .filter(e => e.querySelector('audio'))
    .map(e => ({
      audio: e.querySelector('audio'),
      title: e.querySelector('h3').textContent.trim(),
      sc: e.querySelector('.sc-link')?.href || SOUNDCLOUD_PROFILE
    }));
  if (!player || !tracks.length) return;

  const $ = id => document.getElementById(id);
  const titleEl = $('pTitle'), scEl = $('pSC'), seek = $('pSeek'),
        curEl = $('pCur'), durEl = $('pDur'), playBtn = $('pPlay');
  let cur = 0;

  const fmt = s => isFinite(s)
    ? Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0')
    : '0:00';

  function paint() {
    const a = tracks[cur].audio;
    const pct = a.duration ? (a.currentTime / a.duration) * 100 : 0;
    seek.value = pct;
    seek.style.setProperty('--p', pct + '%');
    curEl.textContent = fmt(a.currentTime);
    durEl.textContent = fmt(a.duration);
  }

  function syncIcon() {
    const playing = !tracks[cur].audio.paused;
    playBtn.innerHTML = playing ? ICON.pause : ICON.play;
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    player.classList.toggle('is-playing', playing);
  }

  function select(i) {
    cur = i;
    titleEl.textContent = tracks[i].title;
    scEl.href = tracks[i].sc;
    paint();
    syncIcon();
  }

  function go(i) {
    tracks[cur].audio.pause();
    select((i + tracks.length) % tracks.length);
    const a = tracks[cur].audio;
    a.currentTime = 0;
    a.play().catch(() => {});
  }

  // Keep the player in sync with the audio tags (including the ones in the Music section)
  tracks.forEach((t, i) => {
    const a = t.audio;
    a.addEventListener('play',  () => { if (cur !== i) select(i); else syncIcon(); });
    a.addEventListener('pause', () => { if (cur === i) syncIcon(); });
    a.addEventListener('timeupdate', () => { if (cur === i) paint(); });
    a.addEventListener('loadedmetadata', () => { if (cur === i) paint(); });
    a.addEventListener('ended', () => { if (i < tracks.length - 1) go(i + 1); });
  });

  playBtn.addEventListener('click', () => {
    const a = tracks[cur].audio;
    a.paused ? a.play().catch(() => {}) : a.pause();
  });
  $('pNext').addEventListener('click', () => go(cur + 1));
  $('pPrev').addEventListener('click', () => {
    const a = tracks[cur].audio;
    if (a.currentTime > 3) a.currentTime = 0; else go(cur - 1);   // like Spotify: restart first
  });
  seek.addEventListener('input', () => {
    const a = tracks[cur].audio;
    if (a.duration) a.currentTime = (seek.value / 100) * a.duration;
    seek.style.setProperty('--p', seek.value + '%');
  });

  // ---------- Universal volume: one slider controls every track ----------
  const VOL_KEY = 'portfolio-volume';
  const SPK = '<path d="M3 9v6h4l5 5V4L7 9H3z"/>';
  const wave = d => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`;
  const VOL_ICON = {
    mute: SPK + wave('M16 9l5 6M21 9l-5 6'),
    low:  SPK + wave('M16 9.5a4 4 0 0 1 0 5'),
    high: SPK + wave('M16 9.5a4 4 0 0 1 0 5') + wave('M18.5 6.5a8 8 0 0 1 0 11')
  };
  const volSlider = $('pVol'), muteBtn = $('pMute');
  let volume = 0.8, muted = false;

  try {
    const saved = JSON.parse(localStorage.getItem(VOL_KEY));
    if (saved && typeof saved.v === 'number') { volume = saved.v; muted = !!saved.m; }
  } catch (e) {}

  function applyVolume() {
    tracks.forEach(t => { t.audio.volume = volume; t.audio.muted = muted; });
    const silent = muted || volume === 0;
    const level = silent ? 'mute' : volume < 0.5 ? 'low' : 'high';
    muteBtn.innerHTML = '<svg viewBox="0 0 24 24">' + VOL_ICON[level] + '</svg>';
    muteBtn.setAttribute('aria-label', silent ? 'Unmute' : 'Mute');
    const pct = silent ? 0 : volume * 100;
    volSlider.value = pct;
    volSlider.style.setProperty('--p', pct + '%');
    try { localStorage.setItem(VOL_KEY, JSON.stringify({ v: volume, m: muted })); } catch (e) {}
  }

  volSlider.addEventListener('input', () => {
    volume = volSlider.value / 100;
    muted = volume === 0;
    applyVolume();
  });

  muteBtn.addEventListener('click', () => {
    if (muted || volume === 0) { muted = false; if (volume === 0) volume = 0.5; }
    else muted = true;
    applyVolume();
  });

  // If someone uses a track's own browser volume control, mirror it everywhere
  tracks.forEach(t => t.audio.addEventListener('volumechange', () => {
    const a = t.audio;
    if (Math.abs(a.volume - volume) > 0.001 || a.muted !== muted) {
      volume = a.volume; muted = a.muted;
      applyVolume();
    }
  }));

  applyVolume();
  select(0);
})();

// ---------- Welcome tour: spotlight the play button, ask visitors to start the music ----------
(function () {
  const tour = document.getElementById('tour');
  const spot = document.getElementById('tourSpot');
  const tip  = document.getElementById('tourTip');
  const playBtn = document.getElementById('pPlay');
  if (!tour || !playBtn) return;

  const KEY = 'portfolio-tour-seen';
  try { if (sessionStorage.getItem(KEY)) return; } catch (e) {}

  function place() {
    const r = playBtn.getBoundingClientRect();
    const pad = 6;
    spot.style.left   = (r.left - pad) + 'px';
    spot.style.top    = (r.top - pad) + 'px';
    spot.style.width  = (r.width + pad * 2) + 'px';
    spot.style.height = (r.height + pad * 2) + 'px';

    const tw = tip.offsetWidth, th = tip.offsetHeight;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;

    if (window.innerWidth > 800) {            // desktop: tooltip to the right of the sidebar player
      tip.className = 'tour-tip side';
      tip.style.left = (r.right + pad + 20) + 'px';
      tip.style.top  = Math.max(12, cy + 29 - th) + 'px';
    } else {                                  // phone: tooltip above the bottom bar
      tip.className = 'tour-tip above';
      const left = Math.min(Math.max(12, cx - tw / 2), window.innerWidth - tw - 12);
      tip.style.left = left + 'px';
      tip.style.top  = Math.max(12, r.top - pad - 18 - th) + 'px';
      tip.style.setProperty('--ax', (cx - left - 7) + 'px');
    }
  }

  function close() {
    tour.hidden = true;
    document.body.style.overflow = '';
    window.removeEventListener('resize', place);
    document.removeEventListener('keydown', onKey);
    try { sessionStorage.setItem(KEY, '1'); } catch (e) {}
  }

  function startMusic() {
    playBtn.click();      // uses the real player, so everything stays in sync
    close();
  }

  function onKey(e) { if (e.key === 'Escape') close(); }

  document.getElementById('tourYes').addEventListener('click', startMusic);
  spot.addEventListener('click', startMusic);
  document.getElementById('tourNo').addEventListener('click', close);

  // If music starts any other way, the tour has done its job
  document.querySelectorAll('audio').forEach(a => a.addEventListener('play', () => { if (!tour.hidden) close(); }));

  setTimeout(() => {
    tour.hidden = false;
    document.body.style.overflow = 'hidden';
    place();
    window.addEventListener('resize', place);
    document.addEventListener('keydown', onKey);
    document.getElementById('tourYes').focus();
  }, 900);   // lets the intro animation finish first
})();