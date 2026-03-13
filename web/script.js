/**
 * Jungle pitch shifter implementation
 */
class Jungle {
    constructor(context) {
        this.context = context;
        this.input = context.createGain();
        this.output = context.createGain();
        this.delayTime = 0.100;
        this.fadeTime = 0.050;
        this.bufferTime = 0.100;

        this.mod1 = context.createOscillator();
        this.mod2 = context.createOscillator();
        this.mod1Gain = context.createGain();
        this.mod2Gain = context.createGain();
        this.mod1Inv = context.createGain();
        this.mod1Inv.gain.value = -1;

        this.processor1 = context.createDelay(this.delayTime * 2);
        this.processor2 = context.createDelay(this.delayTime * 2);
        this.fade1 = context.createGain();
        this.fade2 = context.createGain();

        const length = 4096;
        const curve1 = new Float32Array(length);
        const curve2 = new Float32Array(length);
        for (let i = 0; i < length; i++) {
            const x = i / length;
            curve1[i] = Math.sqrt(Math.cos(x * Math.PI / 2));
            curve2[i] = Math.sqrt(Math.sin(x * Math.PI / 2));
        }

        this.fade1Curve = context.createWaveShaper();
        this.fade1Curve.curve = curve1;
        this.fade2Curve = context.createWaveShaper();
        this.fade2Curve.curve = curve2;

        this.input.connect(this.processor1);
        this.input.connect(this.processor2);
        this.processor1.connect(this.fade1);
        this.processor2.connect(this.fade2);
        this.fade1.connect(this.output);
        this.fade2.connect(this.output);

        this.mod1.connect(this.mod1Gain);
        this.mod2.connect(this.mod2Gain);
        this.mod1Gain.connect(this.processor1.delayTime);
        this.mod2Gain.connect(this.processor2.delayTime);
        this.mod1.connect(this.fade1Curve);
        this.mod2.connect(this.fade2Curve);
        this.fade1Curve.connect(this.fade1.gain);
        this.fade2Curve.connect(this.fade2.gain);

        this.mod1.type = 'sawtooth';
        this.mod2.type = 'sawtooth';
        this.mod1.frequency.value = 1 / this.bufferTime;
        this.mod2.frequency.value = 1 / this.bufferTime;

        this.setPitchOffset(0);
        this.mod1.start();
        this.mod2.start();
    }

    setPitchOffset(offset) {
        const speed = offset * this.bufferTime;
        this.mod1Gain.gain.setTargetAtTime(speed, this.context.currentTime, 0.01);
        this.mod2Gain.gain.setTargetAtTime(speed, this.context.currentTime, 0.01);
        this.processor1.delayTime.value = this.delayTime;
        this.processor2.delayTime.value = this.delayTime;
    }
}

const player = document.getElementById('player');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const resultsSection = document.getElementById('results-section');
const resultsGrid = document.getElementById('results-grid');
const loader = document.getElementById('search-loader');
const playlistItems = document.getElementById('playlist-items');
const nowPlayingTitle = document.getElementById('now-playing-title');
const karaokeKnob = document.getElementById('karaoke-knob');
const labelGuide = document.getElementById('label-guide');
const labelSinging = document.getElementById('label-singing');

const exportBtn = document.getElementById('export-playlist-btn');
const importBtn = document.getElementById('import-playlist-btn');
const mascot = document.getElementById('floating-mascot');

const skipBtn = document.getElementById('skip-btn');
const volumeSlider = document.getElementById('volume-slider');
const clearPlaylistBtn = document.getElementById('clear-playlist-btn');

// Key change controls
const keyDownBtn = document.getElementById('key-down-btn');
const keyUpBtn = document.getElementById('key-up-btn');
const keyResetBtn = document.getElementById('key-reset-btn');
const keyDisplay = document.getElementById('key-display');

// New UI Elements
const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');
const nextSongText = document.getElementById('next-song-text');
const favoritesItems = document.getElementById('favorites-items');
const historyItems = document.getElementById('history-items');
const loadMoreContainer = document.getElementById('load-more-container');
const qrcodeImg = document.getElementById('qrcode-img');
const mobileUrlText = document.getElementById('mobile-url');
const mobileFab = document.getElementById('mobile-fab');
const mobilePopup = document.getElementById('mobile-access-popup');
const closeMobilePopup = document.getElementById('close-mobile-popup');
const mobileUrlLink = document.getElementById('mobile-url-link');
const copyMobileBtn = document.getElementById('copy-mobile-link');
const loadMoreBtn = document.getElementById('load-more-btn');

let playlist = [];
let favorites = JSON.parse(localStorage.getItem('karaoke_favorites') || '[]');
let history = JSON.parse(localStorage.getItem('karaoke_history') || '[]');
let currentIndex = -1;
let playRequestId = 0;
let lastSearchQuery = '';
let searchResultsOffset = 0;
let playbackMode = 'loop'; // 'loop', 'repeat', 'shuffle'

// Dragging state for FAB and Mascot
function makeDraggable(el) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    el.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        // Don't drag if clicking buttons inside popups
        if (e.target.closest('button')) return;

        e = e || window.event;
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
        el.style.transition = 'none';
    }

    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;

        const newTop = el.offsetTop - pos2;
        const newLeft = el.offsetLeft - pos1;

        // Boundaries
        const margin = 10;
        const boundedTop = Math.max(margin, Math.min(window.innerHeight - el.offsetHeight - margin, newTop));
        const boundedLeft = Math.max(margin, Math.min(window.innerWidth - el.offsetWidth - margin, newLeft));

        el.style.top = boundedTop + "px";
        el.style.left = boundedLeft + "px";
        el.style.bottom = 'auto';
        el.style.right = 'auto';
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
        el.style.transition = '';
    }
}

const mobileWidget = document.getElementById('mobile-remote-widget');
if (mobileWidget) makeDraggable(mobileWidget);
if (mascot) makeDraggable(mascot);

// Tab Switching Logic
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');

        tabBtns.forEach(b => b.classList.remove('active'));
        tabPanes.forEach(p => p.classList.remove('active'));

        btn.classList.add('active');
        document.getElementById(targetTab).classList.add('active');

        if (targetTab === 'favorites-tab') renderFavorites();
        if (targetTab === 'history-tab') renderHistory();
    });
});

// Mobile Remote Bridge
eel.expose(js_add_to_playlist);
function js_add_to_playlist(item) {
    console.log("Remote add received (Raw):", item);
    // Double check item.title for mojibake in logs
    addToPlaylist(item);
    switchTab('playlist-tab');
}

eel.expose(js_get_playlist);
function js_get_playlist() {
    return {
        playlist: playlist,
        currentIndex: currentIndex
    };
}

eel.expose(js_play_index);
function js_play_index(index) {
    console.log("Remote play index triggered:", index);
    playSong(index);
}

eel.expose(js_reorder_playlist);
function js_reorder_playlist(fromIdx, toIdx) {
    if (fromIdx === toIdx) return;
    const item = playlist.splice(fromIdx, 1)[0];
    playlist.splice(toIdx, 0, item);

    // Adjust currentIndex
    if (currentIndex === fromIdx) {
        currentIndex = toIdx;
    } else if (currentIndex > fromIdx && currentIndex <= toIdx) {
        currentIndex--;
    } else if (currentIndex < fromIdx && currentIndex >= toIdx) {
        currentIndex++;
    }

    renderPlaylist();
    updateNextSongPrompt();
}

eel.expose(js_delete_from_playlist);
function js_delete_from_playlist(index) {
    removeFromPlaylist(index);
}

eel.expose(js_toggle_play_pause);
function js_toggle_play_pause() {
    console.log("Remote play/pause triggered");
    if (player.paused) player.play();
    else player.pause();
}

eel.expose(js_skip_song);
function js_skip_song() {
    console.log("Remote skip triggered");
    playNext();
}

eel.expose(js_update_pitch);
function js_update_pitch(delta) {
    console.log("Remote update pitch:", delta);
    updatePitchShift(delta);
}

eel.expose(js_reset_pitch);
function js_reset_pitch() {
    console.log("Remote reset pitch");
    currentPitchShift = 0;
    applyPitchShift();
}

eel.expose(js_set_vocal_mode);
function js_set_vocal_mode(mode) {
    console.log("Remote set vocal mode:", mode);
    try { initAudio(); } catch (e) { }
    const isSinging = (mode === 'singing');
    updateModeUI(isSinging);

    if (!audioCtx) return;

    if (isSinging) {
        // Crossfade to wet (Singing Mode - No vocals)
        dryGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
        wetGain.gain.setTargetAtTime(1, audioCtx.currentTime, 0.1);
    } else {
        // Crossfade back to dry (Guide Mode - With vocals)
        dryGain.gain.setTargetAtTime(1, audioCtx.currentTime, 0.1);
        wetGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
    }
}

eel.expose(js_set_volume);
function js_set_volume(level) {
    console.log("Remote set volume:", level);
    player.volume = level;
    if (volumeSlider) volumeSlider.value = level;
}

eel.expose(js_toggle_fullscreen);
function js_toggle_fullscreen() {
    console.log("Remote toggle fullscreen triggered");
    const wrapper = document.getElementById('video-wrapper');
    if (!wrapper) return;

    // 1. Toggle CSS-based pseudo-fullscreen (covers entire browser window)
    const isPseudoNow = wrapper.classList.toggle('pseudo-fullscreen');

    // Hide other floating widgets if in fullscreen
    const widget = document.getElementById('mobile-remote-widget');
    const mascot = document.getElementById('floating-mascot');
    if (isPseudoNow) {
        if (widget) widget.style.display = 'none';
        if (mascot) mascot.style.display = 'none';
    } else {
        if (widget) widget.style.display = 'block';
        if (mascot) mascot.style.display = 'block';
    }

    // 2. Try native fullscreen (covers whole screen)
    // Browsers often block this remotely, so we try and then use Python backup
    try {
        if (isPseudoNow && !document.fullscreenElement) {
            wrapper.requestFullscreen().catch(() => {
                // FALLBACK: If native fails (blocked by browser), trigger system-level F11
                console.log("Native fullscreen blocked, triggering system F11 backup");
                eel.trigger_system_f11();
            });
        } else if (!isPseudoNow && document.fullscreenElement) {
            document.exitFullscreen().catch(() => {
                // FALLBACK: Exit via system F11 if needed
                eel.trigger_system_f11();
            });
        } else if (!isPseudoNow && !document.fullscreenElement) {
            // Case where browser is in F11 mode but wrapper is not in native fullscreen
            // We just trigger F11 again to exit browser fullscreen
            eel.trigger_system_f11();
        }
    } catch (e) {
        console.warn("Fullscreen API interaction failed:", e);
        eel.trigger_system_f11();
    }
}

eel.expose(js_toggle_performance_fx);
function js_toggle_performance_fx() {
    console.log("Remote toggle performance FX");
    const wrapper = document.getElementById('video-wrapper');
    if (wrapper) {
        wrapper.classList.toggle('performance-fx');
    }
}

eel.expose(js_get_status);
function js_get_status() {
    return {
        currentTime: player.currentTime,
        duration: player.duration || 0,
        volume: player.volume,
        isPlaying: !player.paused,
        title: document.querySelector('.song-info .title')?.innerText || "Unknown",
        playbackMode: playbackMode
    };
}

eel.expose(js_seek);
function js_seek(delta) {
    console.log("Remote seek:", delta);
    player.currentTime += delta;
}

eel.expose(js_seek_to);
function js_seek_to(time) {
    console.log("Remote seek to:", time);
    player.currentTime = time;
}

eel.expose(js_toggle_qr);
function js_toggle_qr() {
    console.log("Remote toggle QR");
    if (mobilePopup) {
        mobilePopup.classList.toggle('active');
        mobilePopup.classList.remove('minimized');
    }
}

async function initMobileAccess() {
    if (typeof eel === 'undefined') return;
    try {
        const ip2 = await eel.get_local_ip()();
        const url = `http://${ip2}:8000/mobile`;
        if (mobileUrlLink) {
            mobileUrlLink.innerText = url;
            mobileUrlLink.href = url;
        }
        if (qrcodeImg) qrcodeImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(url)}`;
    } catch (e) {
        console.error("Failed to init mobile access:", e);
    }
}

initMobileAccess();

// Mobile Widget Logic
if (mobileFab) {
    mobileFab.addEventListener('click', () => {
        // If already active and NOT minimized, we can either minimize or close.
        // The user specifically asked to "收" (close/collapse) by clicking the ball.
        if (mobilePopup.classList.contains('active')) {
            mobilePopup.classList.remove('active');
        } else {
            mobilePopup.classList.add('active');
            mobilePopup.classList.remove('minimized');
        }
    });
}

if (closeMobilePopup) {
    closeMobilePopup.addEventListener('click', (e) => {
        e.stopPropagation();
        mobilePopup.classList.remove('active');
    });
}

if (copyMobileBtn) {
    copyMobileBtn.addEventListener('click', () => {
        const url = mobileUrlLink.innerText;
        navigator.clipboard.writeText(url).then(() => {
            const originalIcon = copyMobileBtn.innerHTML;
            copyMobileBtn.innerHTML = '<i class="fas fa-check" style="color: var(--secondary-color)"></i>';
            setTimeout(() => {
                copyMobileBtn.innerHTML = originalIcon;
            }, 2000);
        });
    });
}

function switchTab(tabId) {
    const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    if (btn) btn.click();
}

function saveFavorites() {
    localStorage.setItem('karaoke_favorites', JSON.stringify(favorites));
}

function saveHistory() {
    localStorage.setItem('karaoke_history', JSON.stringify(history));
}

function addToHistory(item) {
    // Remove if already exists (to move to top)
    history = history.filter(i => i.id !== item.id);
    history.unshift(item);
    if (history.length > 100) history.pop(); // Keep last 100
    saveHistory();
}

function toggleFavorite(item, e) {
    if (e) e.stopPropagation();
    const index = favorites.findIndex(f => f.id === item.id);
    if (index === -1) {
        favorites.push(item);
    } else {
        favorites.splice(index, 1);
    }
    saveFavorites();
    renderPlaylist();
    renderFavorites();
    // Update any icons in search results too if they are visible
    updateFavoriteIcons();
}

function updateFavoriteIcons() {
    const allFavBtns = document.querySelectorAll('.fav-btn');
    allFavBtns.forEach(btn => {
        const id = btn.getAttribute('data-id');
        const isFav = favorites.some(f => f.id === id);
        if (isFav) {
            btn.classList.add('active');
            btn.innerHTML = '<i class="fas fa-heart"></i>';
        } else {
            btn.classList.remove('active');
            btn.innerHTML = '<i class="far fa-heart"></i>';
        }
    });
}

function logDebug(msg) {
    // Only console log now that the debug UI is removed
    console.log(`[DEBUG] ${msg}`);
}

// Web Audio API Context
let audioCtx;
let source;
let pitchShifter;
let currentPitchShift = 0;
let splitter;
let merger;
let leftGain;
let rightGain;
let inverter;
let dryGain; // Original audio gain
let wetGain; // Processed audio gain

async function initAudio() {
    if (audioCtx) {
        if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
            console.log("AudioContext resumed");
        }
        return;
    }

    console.log("Initializing audio system...");
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        source = audioCtx.createMediaElementSource(player);

        if (typeof Jungle === 'undefined') {
            console.error("Jungle class is not defined!");
            return;
        }

        pitchShifter = new Jungle(audioCtx);
        pitchShifter.setPitchOffset(0);

        splitter = audioCtx.createChannelSplitter(2);
        merger = audioCtx.createChannelMerger(2);
        inverter = audioCtx.createGain();
        inverter.gain.value = -1;

        dryGain = audioCtx.createGain();
        wetGain = audioCtx.createGain();

        dryGain.gain.value = 1;
        wetGain.gain.value = 0;

        source.connect(pitchShifter.input);
        pitchShifter.output.connect(dryGain);
        dryGain.connect(audioCtx.destination);

        pitchShifter.output.connect(splitter);
        splitter.connect(merger, 0, 0);
        splitter.connect(inverter, 1);
        inverter.connect(merger, 0, 0);
        splitter.connect(merger, 0, 1);
        inverter.connect(merger, 0, 1);

        const boost = audioCtx.createGain();
        boost.gain.value = 1.5;
        merger.connect(boost);
        boost.connect(wetGain);
        wetGain.connect(audioCtx.destination);

        if (audioCtx.state === 'suspended') await audioCtx.resume();
        console.log("Audio system initialized successfully");
    } catch (err) {
        console.error("Audio init error:", err);
    }
}

searchBtn.addEventListener('click', async () => {
    const query = searchInput.value.trim();
    if (!query) return;

    lastSearchQuery = query;
    searchResultsOffset = 0;
    loader.style.display = 'block';
    searchBtn.disabled = true;

    if (typeof eel === 'undefined') {
        alert('【系統提示】偵測到目前處於靜態網頁模式（例如直接開啟 HTML 或使用 GitHub Pages）。\n\n' +
            '「卡拉OK神」需要執行 Python 後端來處理 YouTube 搜尋與串流。請下載並執行 .exe 打包版本，或在本地環境執行 python main.py。');
        loader.style.display = 'none';
        searchBtn.disabled = false;
        return;
    }

    try {
        if (query.includes('youtube.com/') || query.includes('youtu.be/')) {
            // Direct URL
            const videoInfo = await eel.get_video_info(query)();
            if (videoInfo) {
                addToPlaylist(videoInfo);
                searchInput.value = '';
                switchTab('playlist-tab');
            } else {
                alert('無法獲取影片資訊，請檢查網址是否正確。');
            }
        } else {
            // Search keyword
            const results = await eel.search_youtube(query)();
            if (results && results.length > 0) {
                displayResults(results);
                switchTab('search-tab');
            } else {
                alert('找不到相關結果，請換個關鍵字搜尋。');
            }
        }
    } catch (err) {
        console.error('Eel call error:', err);
        alert('搜尋發生系統錯誤：' + err);
    } finally {
        loader.style.display = 'none';
        searchBtn.disabled = false;
    }
});

loadMoreBtn.addEventListener('click', async () => {
    if (!lastSearchQuery) return;

    searchResultsOffset += 20;
    loader.style.display = 'block';
    loadMoreBtn.disabled = true;

    try {
        const results = await eel.search_youtube(lastSearchQuery, searchResultsOffset + 20)();
        if (results && results.length > 0) {
            // Only take the new ones (since ytsearch returns all from beginning)
            const newResults = results.slice(searchResultsOffset);
            displayResults(results, true); // true means append
        } else {
            alert('沒有更多結果了。');
            loadMoreContainer.style.display = 'none';
        }
    } catch (err) {
        console.error('Load more error:', err);
    } finally {
        loader.style.display = 'none';
        loadMoreBtn.disabled = false;
    }
});

function displayResults(results, append = false) {
    if (!append) resultsGrid.innerHTML = '';

    results.forEach(item => {
        const isFav = favorites.some(f => f.id === item.id);
        const card = document.createElement('div');
        card.className = 'result-card fade-in';
        card.innerHTML = `
            <img src="${item.thumbnail}" alt="${item.title}">
            <div class="info">
                <div class="title">${item.title}</div>
            </div>
            <div class="fav-btn ${isFav ? 'active' : ''}" data-id="${item.id}">
                <i class="${isFav ? 'fas' : 'far'} fa-heart"></i>
            </div>
        `;

        card.onclick = (e) => {
            if (e.target.closest('.fav-btn')) return;
            addToPlaylist(item);
        };

        card.querySelector('.fav-btn').onclick = (e) => {
            toggleFavorite(item, e);
        };

        resultsGrid.appendChild(card);
    });

    // Show load more if needed
    if (results.length >= 20) {
        loadMoreContainer.style.display = 'block';
    } else {
        loadMoreContainer.style.display = 'none';
    }
}

// Volume control
volumeSlider.addEventListener('input', (e) => {
    player.volume = e.target.value;
});

// Skip button
skipBtn.addEventListener('click', () => {
    playNext();
});

// Key change controls
keyDownBtn.addEventListener('click', () => {
    updatePitchShift(-1);
});

keyUpBtn.addEventListener('click', () => {
    updatePitchShift(1);
});

keyResetBtn.addEventListener('click', () => {
    currentPitchShift = 0;
    applyPitchShift();
});

function updatePitchShift(delta) {
    try { initAudio(); } catch (e) { }
    currentPitchShift = Math.max(-12, Math.min(12, currentPitchShift + delta));
    applyPitchShift();
}

function applyPitchShift() {
    if (pitchShifter) {
        // currentPitchShift > 0 means Higher pitch (升)
        // In the Jungle shifter, a negative speed decreases delay over time, increasing pitch.
        // Therefore, we negate the offset to align "升" with "up".
        pitchShifter.setPitchOffset(-currentPitchShift / 12);
    }

    // Update text display
    if (currentPitchShift === 0) {
        keyDisplay.innerText = '原調';
        keyDisplay.style.color = '#fff';
        keyDisplay.style.textShadow = '0 0 10px rgba(187, 134, 252, 0.8)';
    } else if (currentPitchShift > 0) {
        keyDisplay.innerText = `♯ ${currentPitchShift}`;
        keyDisplay.style.color = '#fff';
        keyDisplay.style.textShadow = '0 0 10px rgba(187, 134, 252, 0.8)';
    } else {
        keyDisplay.innerText = `♭ ${Math.abs(currentPitchShift)}`;
        keyDisplay.style.color = '#fff';
        keyDisplay.style.textShadow = '0 0 10px rgba(187, 134, 252, 0.8)';
    }

    // Update visual scale (assuming 11 dots, index 5 is center)
    const dots = document.querySelectorAll('.scale-dot');
    dots.forEach((dot, idx) => {
        dot.classList.remove('active');
        // If currentPitchShift > 0 (升), visual should move to the side of the 升 button (Left in our new layout)
        // If currentPitchShift < 0 (降), visual should move to the side of the 降 button (Right in our new layout)
        // Our layout is: [升] [Display] [降]
        // So 升 is Left (idx < 5), 降 is Right (idx > 5)
        // Offset: -currentPitchShift because 升 (positive) is Left (negative index offset from center)
        const visualOffset = Math.max(-5, Math.min(5, -currentPitchShift));
        if (idx === 5 + visualOffset) {
            dot.classList.add('active');
        }
    });
}

// Clear playlist
clearPlaylistBtn.addEventListener('click', () => {
    if (confirm('確定要清空待播清單嗎？')) {
        playlist = [];
        currentIndex = -1;
        player.pause();
        player.removeAttribute('src');
        nowPlayingTitle.innerText = '尚未播放歌曲';
        renderPlaylist();
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Prevent shortcuts when typing in search input
    if (document.activeElement === searchInput) return;

    switch (e.code) {
        case 'Space':
            e.preventDefault();
            if (player.paused) player.play();
            else player.pause();
            break;
        case 'ArrowRight':
            player.currentTime += 5;
            break;
        case 'ArrowLeft':
            player.currentTime -= 5;
            break;
        case 'KeyN':
            if (e.ctrlKey) playNext();
            break;
    }
});

function addToPlaylist(item) {
    playlist.push({ ...item });
    renderPlaylist();
    updateNextSongPrompt();
    showToast(item);
    if (currentIndex === -1) {
        playSong(0);
    }
}

function showToast(item) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.innerHTML = `
        <img src="${item.thumbnail}" class="thumb">
        <div class="content">
            <div class="status">已加入待播清單</div>
            <div class="song-title">${item.title}</div>
        </div>
        <div class="icon">
            <i class="fas fa-check-circle"></i>
        </div>
    `;

    container.appendChild(toast);

    // Auto remove after 4 seconds
    setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

function updateNextSongPrompt() {
    if (currentIndex + 1 < playlist.length) {
        nextSongText.innerText = `下一首：${playlist[currentIndex + 1].title}`;
    } else {
        nextSongText.innerText = '下一首：尚未預約';
    }
}

function renderPlaylist() {
    if (playlist.length === 0) {
        playlistItems.innerHTML = '<p style="text-align: center; color: rgba(255,255,255,0.3); padding-top: 20px;">目前沒有待播歌曲</p>';
        updateNextSongPrompt();
        return;
    }

    playlistItems.innerHTML = '';
    playlist.forEach((item, index) => {
        const isFav = favorites.some(f => f.id === item.id);
        const div = document.createElement('div');
        div.className = `playlist-item ${index === currentIndex ? 'active' : ''}`;
        div.id = `playlist-item-${index}`;
        div.setAttribute('draggable', 'true');
        div.setAttribute('data-index', index);

        div.innerHTML = `
            <img src="${item.thumbnail}" alt="${item.title}" draggable="false">
            <div class="info">
                <div class="title">${item.title}</div>
            </div>
            <div class="delete-btn" title="從清單移除">
                <i class="fas fa-times"></i>
            </div>
            <div class="fav-btn ${isFav ? 'active' : ''}" style="margin-right: 35px;" data-id="${item.id}">
                <i class="${isFav ? 'fas' : 'far'} fa-heart"></i>
            </div>
        `;

        // Click to play
        div.addEventListener('click', (e) => {
            if (e.target.closest('.delete-btn') || e.target.closest('.fav-btn')) return;
            playSong(index);
        });

        // Individual deletion
        const deleteBtn = div.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeFromPlaylist(index);
        });

        const favBtn = div.querySelector('.fav-btn');
        favBtn.addEventListener('click', (e) => {
            toggleFavorite(item, e);
        });

        // Drag events
        div.addEventListener('dragstart', handleDragStart);
        div.addEventListener('dragover', handleDragOver);
        div.addEventListener('drop', handleDrop);
        div.addEventListener('dragend', handleDragEnd);

        playlistItems.appendChild(div);
    });

    // Auto scroll to active item
    if (currentIndex !== -1) {
        const activeItem = document.getElementById(`playlist-item-${currentIndex}`);
        if (activeItem) {
            activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
}

let draggedItemIndex = null;

function handleDragStart(e) {
    draggedItemIndex = parseInt(this.getAttribute('data-index'));
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleDrop(e) {
    e.preventDefault();
    const targetIndex = parseInt(this.getAttribute('data-index'));
    if (draggedItemIndex === null || draggedItemIndex === targetIndex) return;

    // Move item in array
    const item = playlist.splice(draggedItemIndex, 1)[0];
    playlist.splice(targetIndex, 0, item);

    // Update currentIndex if it was moved
    if (currentIndex === draggedItemIndex) {
        currentIndex = targetIndex;
    } else if (currentIndex > draggedItemIndex && currentIndex <= targetIndex) {
        currentIndex--;
    } else if (currentIndex < draggedItemIndex && currentIndex >= targetIndex) {
        currentIndex++;
    }

    renderPlaylist();
}

function handleDragEnd() {
    this.classList.remove('dragging');
    draggedItemIndex = null;
}

function removeFromPlaylist(index) {
    const isPlaying = (index === currentIndex);
    playlist.splice(index, 1);

    if (playlist.length === 0) {
        currentIndex = -1;
        player.pause();
        player.removeAttribute('src');
        nowPlayingTitle.innerText = '尚未播放歌曲';
    } else {
        if (isPlaying) {
            // If we deleted the playing song, play the same index (now next song)
            playSong(Math.min(index, playlist.length - 1));
        } else if (index < currentIndex) {
            // If we deleted a song before current, shift index
            currentIndex--;
        }
    }
    renderPlaylist();
    updateNextSongPrompt();
}

async function playSong(index) {
    if (index < 0 || index >= playlist.length) return;

    const thisRequestId = ++playRequestId;
    currentIndex = index;
    const item = playlist[index];
    nowPlayingTitle.innerText = `正在播放：${item.title}`;
    renderPlaylist();
    updateNextSongPrompt();
    addToHistory(item);

    // Reset player state completely
    player.pause();
    player.removeAttribute('src');
    player.load();

    logDebug(`正在解析歌曲: ${item.title}`);

    try {
        const streamUrl = await eel.get_stream_url(item.id)();
        if (thisRequestId !== playRequestId) return; // Ignore if another song was requested while resolving

        if (!streamUrl) {
            throw new Error('後端回傳網址為空');
        }

        logDebug(`取得網址: ${streamUrl.substring(0, 50)}...`);

        player.src = streamUrl;

        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        await player.play().catch(e => {
            if (e.name === 'AbortError') {
                logDebug(`播放被中止 (AbortError) - 可能有新的載入請求，忽略此錯誤。`);
                return;
            }
            logDebug(`播放啟動失敗: ${e.name}`);
            throw e;
        });

        logDebug(`開始成功播放`);

    } catch (err) {
        logDebug(`錯誤詳細: ${err.message}`);
        console.error('Playback Context Error:', err);
        alert(`播放失敗：${err.message}\n\n這通常與 YouTube 限制或網路狀況有關。請嘗試搜尋其他版本的影片或稍後再試。`);

        setTimeout(playNext, 3000);
    }
}

function playNext() {
    if (playbackMode === 'repeat') {
        playSong(currentIndex);
    } else if (playbackMode === 'shuffle') {
        const nextIdx = Math.floor(Math.random() * playlist.length);
        playSong(nextIdx);
    } else {
        // Default loop behavior
        if (currentIndex + 1 < playlist.length) {
            playSong(currentIndex + 1);
        } else {
            // Loop back to start
            playSong(0);
        }
    }
}

function togglePlaybackMode() {
    const btn = document.getElementById('mode-toggle-btn');
    const icon = btn.querySelector('i');
    const text = document.getElementById('mode-text');

    if (playbackMode === 'loop') {
        playbackMode = 'repeat';
        icon.className = 'fas fa-redo-alt';
        text.innerText = '單曲重播';
    } else if (playbackMode === 'repeat') {
        playbackMode = 'shuffle';
        icon.className = 'fas fa-random';
        text.innerText = '隨機播放';
    } else {
        playbackMode = 'loop';
        icon.className = 'fas fa-repeat';
        text.innerText = '全曲循環';
    }
}

const modeBtn = document.getElementById('mode-toggle-btn');
if (modeBtn) {
    modeBtn.addEventListener('click', togglePlaybackMode);
}

eel.expose(js_set_playback_mode);
function js_set_playback_mode(mode) {
    if (['loop', 'repeat', 'shuffle'].includes(mode)) {
        playbackMode = mode;
        const btn = document.getElementById('mode-toggle-btn');
        if (!btn) return;
        const icon = btn.querySelector('i');
        const text = document.getElementById('mode-text');
        
        if (mode === 'loop') {
            icon.className = 'fas fa-repeat';
            text.innerText = '全曲循環';
        } else if (mode === 'repeat') {
            icon.className = 'fas fa-redo-alt';
            text.innerText = '單曲重播';
        } else if (mode === 'shuffle') {
            icon.className = 'fas fa-random';
            text.innerText = '隨機播放';
        }
    }
}

player.onended = () => {
    playNext();
};

player.onplay = () => {
    try {
        initAudio();
    } catch (e) {
        console.warn("Web Audio Init failed (possibly CORS):", e);
    }

    // Resume context on every play due to browser policies
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().then(() => console.log("AudioContext resumed"));
    }
};

player.onerror = () => {
    const err = player.error;
    let msg = '影片播放發生錯誤。';
    let codeName = 'UNKNOWN';
    if (err) {
        switch (err.code) {
            case 1: msg += ' (使用者中止)'; codeName = 'MEDIA_ERR_ABORTED'; break;
            case 2: msg += ' (網路錯誤)'; codeName = 'MEDIA_ERR_NETWORK'; break;
            case 3: msg += ' (解碼錯誤 - 瀏覽器可能不支援此格式)'; codeName = 'MEDIA_ERR_DECODE'; break;
            case 4:
                msg += ' (不支援的來源或格式)';
                codeName = 'MEDIA_ERR_SRC_NOT_SUPPORTED';
                msg += '\n這通常是因為影片網址解析失敗或是編碼不正確。';
                break;
        }
    }
    logDebug(`播放器報錯: [${codeName}] ${msg}`);
    alert(`播放失敗 (錯誤碼 ${err ? err.code : '?'}): ${msg}\n\n請嘗試搜尋其他影片來源，或重新啟動程式。`);
};

const updateModeUI = (isSinging) => {
    if (isSinging) {
        karaokeKnob.classList.add('active');
        labelSinging.classList.add('active');
        labelGuide.classList.remove('active');
    } else {
        karaokeKnob.classList.remove('active');
        labelSinging.classList.remove('active');
        labelGuide.classList.add('active');
    }
};

karaokeKnob.addEventListener('click', () => {
    try { initAudio(); } catch (e) { }
    const isSinging = !karaokeKnob.classList.contains('active');
    updateModeUI(isSinging);

    if (!audioCtx) return;

    if (isSinging) {
        // Crossfade to wet (Singing Mode - No vocals)
        dryGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
        wetGain.gain.setTargetAtTime(1, audioCtx.currentTime, 0.1);
    } else {
        // Crossfade back to dry (Guide Mode - With vocals)
        dryGain.gain.setTargetAtTime(1, audioCtx.currentTime, 0.1);
        wetGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
    }
});

function renderFavorites() {
    if (favorites.length === 0) {
        favoritesItems.innerHTML = '<p style="text-align: center; color: rgba(255,255,255,0.3); padding-top: 20px;">尚無收藏歌曲</p>';
        return;
    }
    favoritesItems.innerHTML = '';
    favorites.forEach(item => {
        const div = document.createElement('div');
        div.className = 'playlist-item';
        div.innerHTML = `
            <img src="${item.thumbnail}" alt="${item.title}">
            <div class="info">
                <div class="title">${item.title}</div>
            </div>
            <div class="fav-btn active" data-id="${item.id}">
                <i class="fas fa-heart"></i>
            </div>
        `;
        div.onclick = (e) => {
            if (e.target.closest('.fav-btn')) return;
            addToPlaylist(item);
        };
        div.querySelector('.fav-btn').onclick = (e) => {
            toggleFavorite(item, e);
        };
        favoritesItems.appendChild(div);
    });
}

function renderHistory() {
    if (history.length === 0) {
        historyItems.innerHTML = '<p style="text-align: center; color: rgba(255,255,255,0.3); padding-top: 20px;">尚無播放記錄</p>';
        return;
    }
    historyItems.innerHTML = '';
    history.forEach(item => {
        const isFav = favorites.some(f => f.id === item.id);
        const div = document.createElement('div');
        div.className = 'playlist-item';
        div.innerHTML = `
            <img src="${item.thumbnail}" alt="${item.title}">
            <div class="info">
                <div class="title">${item.title}</div>
            </div>
            <div class="fav-btn ${isFav ? 'active' : ''}" data-id="${item.id}">
                <i class="${isFav ? 'fas' : 'far'} fa-heart"></i>
            </div>
        `;
        div.onclick = (e) => {
            if (e.target.closest('.fav-btn')) return;
            addToPlaylist(item);
        };
        div.querySelector('.fav-btn').onclick = (e) => {
            toggleFavorite(item, e);
        };
        historyItems.appendChild(div);
    });
}

// Export/Import Playlist
const formatDateTime = () => {
    const now = new Date();
    const Y = now.getFullYear();
    const M = String(now.getMonth() + 1).padStart(2, '0');
    const D = String(now.getDate()).padStart(2, '0');
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    return `${Y}${M}${D}_${h}${m}${s}`;
};

exportBtn.addEventListener('click', () => {
    if (playlist.length === 0) return alert('目前沒有待播歌曲可以匯出。');
    const data = JSON.stringify(playlist, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `karaoke-shen_playlist_${formatDateTime()}.json`;
    a.click();
    URL.revokeObjectURL(url);
});

importBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const raw = e.target.result;
            console.log("Raw import content:", raw);
            try {
                const imported = JSON.parse(raw.trim());
                console.log("Imported data:", imported);
                if (Array.isArray(imported)) {
                    playlist = [...playlist, ...imported];
                    renderPlaylist();
                    if (currentIndex === -1 && playlist.length > 0) {
                        playSong(0);
                    }
                    alert('匯入成功！已加入 ' + imported.length + ' 首歌曲。');
                } else {
                    throw new Error("匯入內容不是有效的清單格式（必須是陣列）");
                }
            } catch (err) {
                console.error("Import error details:", err);
                alert('匯入失敗：\n' + err.message + '\n\n這可能是檔案內容毀損或格式不相容。');
            }
        };
        // Explicitly use UTF-8 just in case
        reader.readAsText(file, 'UTF-8');
    };
    input.click();
});

// Mascot Drag Logic
let isDraggingMascot = false;
let mascotOffsetX = 0;
let mascotOffsetY = 0;

mascot.addEventListener('mousedown', (e) => {
    // Add the class first to kill any animations/transforms
    mascot.classList.add('dragging-mascot');
    isDraggingMascot = true;

    // Now get the rect when it's settled (no transform)
    const rect = mascot.getBoundingClientRect();
    mascotOffsetX = e.clientX - rect.left;
    mascotOffsetY = e.clientY - rect.top;

    // Support for higher precision
    e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
    if (!isDraggingMascot) return;

    let x = e.clientX - mascotOffsetX;
    let y = e.clientY - mascotOffsetY;

    // Bounds check within viewport
    x = Math.max(0, Math.min(x, window.innerWidth - mascot.offsetWidth));
    y = Math.max(0, Math.min(y, window.innerHeight - mascot.offsetHeight));

    // Update position
    mascot.style.left = x + 'px';
    mascot.style.top = y + 'px';
    mascot.style.bottom = 'auto';
    mascot.style.right = 'auto';
});

document.addEventListener('mouseup', () => {
    if (isDraggingMascot) {
        isDraggingMascot = false;
        mascot.classList.remove('dragging-mascot');
    }
});

// Allow enter key to search
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        searchBtn.click();
    }
});

// --- Settings UI ---
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettings = document.getElementById('close-settings');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const pcAdminPass = document.getElementById('pc-admin-pass');

if (settingsBtn) {
    settingsBtn.addEventListener('click', async () => {
        if (typeof eel !== 'undefined') {
            try {
                const currentPass = await eel.get_admin_password()();
                if (pcAdminPass) pcAdminPass.value = currentPass;
            } catch(e) {}
        }
        if (settingsModal) settingsModal.style.display = 'block';
    });
}

if (closeSettings) {
    closeSettings.addEventListener('click', () => {
        if (settingsModal) settingsModal.style.display = 'none';
    });
}

if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', async () => {
        if (typeof eel !== 'undefined' && pcAdminPass) {
            try {
                await eel.set_admin_password(pcAdminPass.value)();
                alert('系統設定已儲存！');
                if (settingsModal) settingsModal.style.display = 'none';
            } catch(e) {
                alert('設定失敗');
            }
        }
    });
}
