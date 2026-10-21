const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const rand = (min, max) => min + Math.random() * (max - min);
/* ---------- intro loader (only shows if the page is slow) ---------- */

const LOADER_DELAY = 400; // ms of waiting before the loader is worth showing

function runLoader() {
  const loader = document.getElementById("loader");
  const stars = [...loader.querySelectorAll(".loader-stars svg")];
  let cycle;

  const finish = () => {
    loader.classList.add("is-done");
    document.body.classList.remove("is-loading");
    dropStars();
  };

  if (document.readyState === "complete") {
    finish();
    return;
  }

  // still loading after the delay: fade the loader in and loop the stars until we're done
  const showTimer = setTimeout(() => {
    loader.classList.add("is-visible");
    let lit = 0;
    cycle = setInterval(() => {
      if (lit === stars.length) {
        stars.forEach((s) => s.classList.remove("lit"));
        lit = 0;
      } else {
        stars[lit++].classList.add("lit");
      }
    }, reduceMotion ? 120 : 320);
  }, LOADER_DELAY);

  window.addEventListener(
    "load",
    () => {
      clearTimeout(showTimer);
      if (!cycle) {
        finish(); // loaded fast: the loader never appeared
        return;
      }
      clearInterval(cycle);
      stars.forEach((s) => s.classList.add("lit"));
      setTimeout(finish, 350);
    },
    { once: true }
  );
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

// every section is already on the page, so switching is instant (no loader needed)
function go(target) {
  if (target === current) return;
  const prev = document.getElementById(current);
  const next = document.getElementById(target);
  prev.hidden = true;
  prev.classList.remove("is-shown");
  next.hidden = false;
  // restart the entrance animation
  void next.offsetWidth;
  next.classList.add("is-shown");
  window.scrollTo({ top: 0 });

  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.go === target);
  });
  current = target;
  if (target === "about") startMusic();
  else stopMusic();
  history.replaceState(null, "", target === "home" ? location.pathname : `#${target}`);
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
    videoFile.src = src;
    videoFile.play().catch(() => {}); // the click counts as a user gesture, so sound is allowed
  } else {
    videoFrame.src = src;
  }
});

// close on the × button or a click on the dimmed backdrop
videoModal.addEventListener("click", (e) => {
  if (e.target === videoModal || e.target.closest(".video-close")) videoModal.close();
});

// clearing src stops playback when the pop-up closes (esc included)
videoModal.addEventListener("close", () => {
  videoFrame.src = "";
  videoFile.pause();
  videoFile.removeAttribute("src");
  videoFile.load();
});

/* ---------- start ---------- */

const startHash = location.hash.slice(1);
if (startHash && document.getElementById(startHash)?.classList.contains("page")) {
  document.getElementById("home").hidden = true;
  document.getElementById("home").classList.remove("is-shown");
  const page = document.getElementById(startHash);
  page.hidden = false;
  page.classList.add("is-shown");
  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.go === startHash);
  });
  current = startHash;
  if (startHash === "about") startMusic();
}

runLoader();
