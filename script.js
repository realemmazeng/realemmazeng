const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const rand = (min, max) => min + Math.random() * (max - min);
/* ---------- intro loader (always plays once on entry) ---------- */

const LOADER_MIN = 2200; // ms the loader stays up, even if the page is already loaded

function runLoader() {
  const loader = document.getElementById("loader");
  const fill = document.getElementById("xpFill");
  const num = document.getElementById("xpNum");
  const start = performance.now();
  let loaded = document.readyState === "complete";
  if (!loaded) window.addEventListener("load", () => (loaded = true), { once: true });

  const setXp = (p) => {
    fill.style.width = `${p}%`;
    num.textContent = `${Math.round(p)}%`;
  };

  // eases up to 90% over LOADER_MIN, holds there if the page is still loading, then tops off
  const tick = (now) => {
    const t = Math.min((now - start) / LOADER_MIN, 1);
    setXp(90 * (1 - (1 - t) ** 2));
    if (t < 1 || !loaded) {
      requestAnimationFrame(tick);
      return;
    }
    setXp(100);
    loader.classList.add("is-full");
    setTimeout(() => {
      loader.classList.add("is-done");
      document.body.classList.remove("is-loading");
      dropStars();
      popName();
    }, 450);
  };
  requestAnimationFrame(tick);
}

// splits the name into letters and pops them in once; afterwards the animation comes off,
// so returning to home (or the page-turn copy) doesn't replay it
function popName() {
  const name = document.getElementById("home-title");
  if (document.getElementById("home").hidden) return;
  const text = name.textContent;
  name.setAttribute("aria-label", text);
  name.textContent = "";
  [...text].forEach((ch, i) => {
    const letter = document.createElement("span");
    letter.className = "letter";
    letter.setAttribute("aria-hidden", "true");
    letter.style.setProperty("--i", i);
    letter.textContent = ch;
    name.appendChild(letter);
  });
  name.classList.add("is-popping");
  const last = name.lastElementChild;
  last.addEventListener("animationend", () => name.classList.remove("is-popping"), { once: true });
}

/* ---------- floating gummy stars ---------- */

function spawnStar(container, i) {
  const star = document.createElement("span");
  star.className = "floaty";

  // they sit behind the content, so they can land anywhere
  star.style.left = `${rand(2, 96)}vw`;
  star.style.top = `${rand(8, 94)}vh`;
  star.style.setProperty("--size", `${rand(10, 22)}px`);
  star.style.setProperty("--fall-delay", `${i * 0.09 + rand(0, 0.3)}s`);
  star.style.setProperty("--sway", `${rand(-40, 40)}px`);
  star.style.setProperty("--dur", `${rand(4, 8)}s`);
  star.style.setProperty("--rot", `${rand(-25, 25)}deg`);
  star.style.setProperty("--dx", `${rand(-10, 10)}px`);
  star.style.setProperty("--dy", `${rand(-14, 14)}px`);
  star.innerHTML = `<span class="drift"><svg><use href="#gummy"/></svg></span>`;

  container.appendChild(star);
}

function dropStars() {
  const floaties = document.getElementById("floaties");
  for (let i = 0; i < 22; i++) spawnStar(floaties, i);
}

/* ---------- page switching ---------- */

let current = "home";

function setActive(target) {
  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.go === target);
  });
  current = target;
  if (target === "about") startMusic();
  else stopMusic();
  history.replaceState(null, "", target === "home" ? location.pathname : `#${target}`);
}

// pages in binder order: going right turns the page over, going left turns one back
const ORDER = ["home", "projects", "about"];
let endFlip = null;

function showPage(page, rise) {
  page.hidden = false;
  page.classList.toggle("is-turned", !rise);
  // restart the entrance animation
  void page.offsetWidth;
  page.classList.add("is-shown");
}

function hidePage(page) {
  page.hidden = true;
  page.classList.remove("is-shown", "is-turned");
}

// a still copy of a page for the turning leaf (no ids, nothing that loads or plays)
function copyPage(page) {
  const copy = page.cloneNode(true);
  copy.removeAttribute("id");
  copy.hidden = false;
  copy.classList.remove("is-shown", "is-turned");
  copy.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
  copy.querySelectorAll("iframe, audio, video").forEach((el) => el.remove());
  return copy;
}

function flipPage(prev, next, forward) {
  const main = document.querySelector("main");
  const leaf = document.createElement("div");
  leaf.className = `leaf ${forward ? "is-away" : "is-back"}`;
  leaf.setAttribute("aria-hidden", "true");
  leaf.inert = true;
  leaf.style.height = `${main.clientHeight}px`;

  const front = document.createElement("div");
  front.className = "leaf-face";
  // forward: the old page lifts off the new one. back: the new page lands on the old one
  front.appendChild(copyPage(forward ? prev : next));
  const back = document.createElement("div");
  back.className = "leaf-face leaf-back";
  leaf.append(front, back);

  if (forward) {
    hidePage(prev);
    showPage(next, true);
  }
  main.appendChild(leaf);

  endFlip = () => {
    endFlip = null;
    clearTimeout(fallback);
    if (!forward) {
      hidePage(prev);
      showPage(next, false);
    }
    leaf.remove();
  };
  leaf.addEventListener("animationend", (e) => e.target === leaf && endFlip?.());
  const fallback = setTimeout(() => endFlip?.(), 1200); // in case animationend never fires
}

function go(target) {
  if (target === current) return;
  endFlip?.(); // a fast second click finishes the turn already in progress
  const prev = document.getElementById(current);
  const next = document.getElementById(target);
  window.scrollTo({ top: 0, behavior: "instant" });

  if (reduceMotion) {
    hidePage(prev);
    showPage(next, true);
  } else {
    flipPage(prev, next, ORDER.indexOf(target) > ORDER.indexOf(current));
  }
  setActive(target);
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-go]");
  if (btn) go(btn.dataset.go);
});

/* ---------- spotify now playing / last played (via last.fm) ---------- */

// fill these in to turn the card on: last.fm username + a free last.fm api key
const LASTFM_USER = "";
const LASTFM_KEY = "";
const MUSIC_REFRESH = 30000; // check for a new song every 30s while the about tab is open

let musicTimer = null;

async function loadMusic() {
  const card = document.getElementById("nowPlaying");
  if (!LASTFM_USER || !LASTFM_KEY) return; // not set up yet: card stays hidden
  try {
    const url =
      "https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks" +
      `&user=${encodeURIComponent(LASTFM_USER)}&api_key=${LASTFM_KEY}&format=json&limit=1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    const track = (await res.json()).recenttracks?.track?.[0];
    if (!track) return;

    const live = track["@attr"]?.nowplaying === "true";
    const art = (track.image || []).find((i) => i.size === "extralarge")?.["#text"];
    card.classList.toggle("is-live", live);
    card.querySelector(".np-label").textContent = live ? "now playing" : "last played";
    const link = card.querySelector(".np-track");
    link.textContent = track.name;
    link.href = track.url;
    card.querySelector(".np-artist").textContent = track.artist?.["#text"] || "";
    const img = card.querySelector(".np-art");
    if (art) img.src = art;
    else img.removeAttribute("src");
    card.hidden = false;
  } catch {
    // keep showing whatever loaded last; if nothing ever loaded, the card just stays hidden
  }
}

// only poll while someone is actually looking at the about tab
function startMusic() {
  loadMusic();
  clearInterval(musicTimer);
  musicTimer = setInterval(loadMusic, MUSIC_REFRESH);
}

function stopMusic() {
  clearInterval(musicTimer);
  musicTimer = null;
}

/* ---------- art, on the about page (pinterest stats) ---------- */

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

async function loadArt() {
  const grid = document.getElementById("artGrid");
  try {
    const res = await fetch("assets/art.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status);
    const art = await res.json();
    if (!art.pins?.length) throw new Error("empty");

    for (const pin of art.pins) {
      // plain frames, not links: the art stays on this page instead of leading to the pinterest account
      const a = document.createElement("div");
      a.className = "art-piece";
      a.style.setProperty("--tilt", `${rand(-2, 2)}deg`);

      const img = document.createElement("img");
      img.src = pin.image;
      img.alt = pin.title;
      img.loading = "lazy";
      a.append(img);

      // optional label under the piece, like writing on a polaroid
      if (pin.caption) {
        const cap = document.createElement("p");
        cap.className = "art-caption";
        cap.textContent = pin.caption;
        a.append(cap);
      }

      if (pin.id) {
        a.tabIndex = 0; // lets keyboard users reach the stats too
        const stats = document.createElement("span");
        stats.className = "art-stats";
        stats.title = `last ${art.window_days} days on pinterest`;
        stats.innerHTML = `
          <span><b>${compact.format(pin.impressions)}</b> views</span>
          <span><b>${compact.format(pin.saves)}</b> saves</span>
          <span><b>${compact.format(pin.clicks)}</b> clicks</span>`;
        a.append(stats);
      }

      grid.appendChild(a);
    }
    document.getElementById("art").hidden = false;
  } catch {
    // no art yet: the section just stays hidden
  }
}

// clicking the pink "draw" shows or hides the art
document.querySelector(".art-toggle").addEventListener("click", (e) => {
  const grid = document.getElementById("artGrid");
  grid.hidden = !grid.hidden;
  e.currentTarget.setAttribute("aria-expanded", String(!grid.hidden));
});

/* ---------- music player (about page) ---------- */

// pick the songs here. src = an audio file (e.g. "assets/music/song.mp3" or a preview link),
// cover = album art. the player stays hidden while this list is empty.
// these are apple's free 30-second previews (found via the itunes search api)
const PLAYLIST = [
  {
    title: "Cyanide",
    artist: "Daniel Caesar",
    src: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/f1/fc/a6/f1fca678-c68e-8853-0576-e3244288321a/mzaf_6850192022117389642.plus.aac.p.m4a",
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/aa/16/83/aa1683e3-6b82-e14c-8c56-2dad38d3dd02/193483999333.jpg/200x200bb.jpg",
  },
  {
    title: "Club Paradise",
    artist: "Drake",
    src: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/55/58/1e/55581e35-5df0-7d1e-9a33-f3cd12624323/mzaf_6620843008779799356.plus.aac.p.m4a",
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music123/v4/34/e5/46/34e546b6-94c9-960e-cd35-4f35ffcd6860/19UMGIM71794.rgb.jpg/200x200bb.jpg",
  },
  {
    title: "Solar Eclipse",
    artist: "Drake & Don Toliver",
    src: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/9f/d3/6f/9fd36f93-027f-aef8-67cc-e9701f8cf4f5/mzaf_4702287322687146814.plus.aac.p.m4a",
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/62/58/98/62589807-decc-d418-eb07-5060de9a2d3e/26UMGIM63617.rgb.jpg/200x200bb.jpg",
  },
];

const player = document.getElementById("player");
const audio = document.getElementById("playerAudio");
const playerList = document.getElementById("playerList");
let trackIdx = 0;

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function setupPlayer() {
  if (!PLAYLIST.length) return;
  PLAYLIST.forEach((song, i) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.className = "pl-track";
    btn.type = "button";
    btn.dataset.track = i;

    const cover = document.createElement("img");
    cover.className = "pl-cover";
    cover.alt = "";
    if (song.cover) cover.src = song.cover;

    const info = document.createElement("span");
    info.className = "pl-info";
    const title = document.createElement("span");
    title.className = "pl-title";
    title.textContent = song.title;
    const artist = document.createElement("span");
    artist.className = "pl-artist";
    artist.textContent = song.artist;
    info.append(title, artist);

    const time = document.createElement("span");
    time.className = "pl-time";
    // read just the file header to learn the length, without downloading the song
    const probe = new Audio();
    probe.preload = "metadata";
    probe.addEventListener("loadedmetadata", () => (time.textContent = clock(probe.duration)), { once: true });
    probe.src = song.src;

    btn.append(cover, info, time);
    li.appendChild(btn);
    playerList.appendChild(li);
  });
  loadTrack(0);
  player.hidden = false;
}

function loadTrack(i) {
  trackIdx = (i + PLAYLIST.length) % PLAYLIST.length;
  audio.src = PLAYLIST[trackIdx].src;
  playerList.querySelectorAll(".pl-track").forEach((b) => {
    b.classList.toggle("is-current", Number(b.dataset.track) === trackIdx);
  });
}

function playTrack(i) {
  loadTrack(i);
  audio.play().catch(() => {});
}

player.addEventListener("click", (e) => {
  const track = e.target.closest("[data-track]");
  if (track) {
    const i = Number(track.dataset.track);
    if (i === trackIdx) audio.paused ? audio.play() : audio.pause();
    else playTrack(i);
    return;
  }
  const btn = e.target.closest("[data-pl]");
  if (!btn) return;
  const action = btn.dataset.pl;
  if (action === "play") audio.paused ? audio.play().catch(() => {}) : audio.pause();
  else if (action === "prev") playTrack(audio.currentTime > 3 ? trackIdx : trackIdx - 1); // like most players: restart first
  else if (action === "next") playTrack(trackIdx + 1);
  else if (action === "mute") {
    audio.muted = !audio.muted;
    btn.setAttribute("aria-pressed", String(audio.muted));
    btn.setAttribute("aria-label", audio.muted ? "unmute" : "mute");
  } else if (action === "list") {
    playerList.hidden = !playerList.hidden;
    btn.setAttribute("aria-expanded", String(!playerList.hidden));
  }
});

audio.addEventListener("play", () => {
  player.classList.add("is-playing");
  player.querySelector(".pl-play").setAttribute("aria-label", "pause");
});
audio.addEventListener("pause", () => {
  player.classList.remove("is-playing");
  player.querySelector(".pl-play").setAttribute("aria-label", "play");
});
audio.addEventListener("ended", () => playTrack(trackIdx + 1));

/* ---------- light / dark theme ---------- */

// no saved pick = follow the system setting; the nav button saves an explicit pick
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
const themeBtn = document.getElementById("themeBtn");
const themeMeta = document.querySelector('meta[name="theme-color"]');

const currentTheme = () => document.documentElement.dataset.theme || (systemDark.matches ? "dark" : "light");

function syncTheme() {
  const dark = currentTheme() === "dark";
  themeBtn.setAttribute("aria-label", dark ? "switch to light mode" : "switch to dark mode");
  themeMeta.content = getComputedStyle(document.documentElement).getPropertyValue("--paper").trim();
}

themeBtn.addEventListener("click", () => {
  const next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem("theme", next);
  } catch {}
  syncTheme();
});

systemDark.addEventListener("change", syncTheme);
syncTheme();

/* ---------- demo video pop-up ---------- */

const videoModal = document.getElementById("videoModal");
const videoFrame = videoModal.querySelector("iframe");
const videoFile = videoModal.querySelector("video");

// data-video can be a local .mp4 (autoplays) or an embed link like google drive (press play)
document.addEventListener("click", (e) => {
  const link = e.target.closest("[data-video]");
  if (!link) return;
  e.preventDefault();
  const src = link.dataset.video;
  const isFile = /\.(mp4|webm|mov)$/i.test(src);
  videoFile.hidden = !isFile;
  videoFrame.hidden = isFile;
  videoModal.showModal();
  if (isFile) {
    // already buffered by preloadVideo(): reassigning src would throw that away
    if (videoFile.getAttribute("src") !== src) videoFile.src = src;
    videoFile.play().catch(() => {}); // the click counts as a user gesture, so sound is allowed
  } else {
    videoFrame.src = src;
  }
});

// close on the × button or a click on the dimmed backdrop
videoModal.addEventListener("click", (e) => {
  if (e.target === videoModal || e.target.closest(".video-close")) videoModal.close();
});

// stop playback when the pop-up closes (esc included); the file stays loaded so it replays instantly
videoModal.addEventListener("close", () => {
  videoFrame.src = "";
  videoFile.pause();
  videoFile.currentTime = 0;
});

// download the first demo video as soon as the site opens, so a click on the card plays it right away
function preloadVideo() {
  const link = document.querySelector('[data-video$=".mp4"], [data-video$=".webm"], [data-video$=".mov"]');
  if (!link || videoFile.getAttribute("src")) return;
  videoFile.preload = "auto";
  videoFile.src = link.dataset.video;
}

/* ---------- start ---------- */

const startHash = location.hash.slice(1);
if (startHash && document.getElementById(startHash)?.classList.contains("page")) {
  document.getElementById("home").hidden = true;
  document.getElementById("home").classList.remove("is-shown");
  const page = document.getElementById(startHash);
  page.hidden = false;
  page.classList.add("is-shown");
  setActive(startHash);
}

// after the rest of the page, so the video doesn't slow down the first load
if (document.readyState === "complete") preloadVideo();
else window.addEventListener("load", preloadVideo, { once: true });
loadArt();
setupPlayer();
runLoader();
