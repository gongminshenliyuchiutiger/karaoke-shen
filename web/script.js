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

let playlist = [];
let currentIndex = -1;
let playRequestId = 0;

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

function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    source = audioCtx.createMediaElementSource(player);

    pitchShifter = new Jungle(audioCtx);
    pitchShifter.setPitchOffset(0);

    splitter = audioCtx.createChannelSplitter(2);
    merger = audioCtx.createChannelMerger(2);

    // Create an inverter for the right channel
    inverter = audioCtx.createGain();
    inverter.gain.value = -1;

    // Nodes for "Karaoke" path (L - R)
    // L -> Merger[0]
    // R -> Inverter -> Merger[0]
    // This makes Merger[0] = L - R

    dryGain = audioCtx.createGain();
    wetGain = audioCtx.createGain();

    // Default state: Dry only
    dryGain.gain.value = 1;
    wetGain.gain.value = 0;

    source.connect(pitchShifter.input);
    pitchShifter.output.connect(dryGain);
    dryGain.connect(audioCtx.destination);

    // Karaoke Path
    pitchShifter.output.connect(splitter);

    // Right channel sum (mono to both)
    // Create L-R on both channels
    splitter.connect(merger, 0, 0); // L -> Left
    splitter.connect(inverter, 1);  // R -> Inverter
    inverter.connect(merger, 0, 0); // -R -> Left (Left = L - R)

    splitter.connect(merger, 0, 1); // L -> Right
    inverter.connect(merger, 0, 1); // -R -> Right (Right = L - R)

    // Gain compensation for L-R
    const boost = audioCtx.createGain();
    boost.gain.value = 1.5;

    merger.connect(boost);
    boost.connect(wetGain);
    wetGain.connect(audioCtx.destination);
}

searchBtn.addEventListener('click', async () => {
    const query = searchInput.value.trim();
    if (!query) return;

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
            } else {
                alert('無法獲取影片資訊，請檢查網址是否正確。');
            }
        } else {
            // Search keyword
            const results = await eel.search_youtube(query)();
            if (results && results.length > 0) {
                displayResults(results);
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

function displayResults(results) {
    resultsGrid.innerHTML = '';
    resultsSection.style.display = 'block';

    results.forEach(item => {
        const card = document.createElement('div');
        card.className = 'result-card fade-in';
        card.innerHTML = `
      <img src="${item.thumbnail}" alt="${item.title}">
      <div class="info">
        <div class="title">${item.title}</div>
      </div>
    `;
        card.onclick = () => {
            addToPlaylist(item);
            resultsSection.style.display = 'none';
            searchInput.value = '';
        };
        resultsGrid.appendChild(card);
    });
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
    playlist.push(item);
    renderPlaylist();
    if (currentIndex === -1) {
        playSong(0);
    }
}

function renderPlaylist() {
    if (playlist.length === 0) {
        playlistItems.innerHTML = '<p style="text-align: center; color: rgba(255,255,255,0.3); padding-top: 20px;">目前沒有待播歌曲</p>';
        return;
    }

    playlistItems.innerHTML = '';
    playlist.forEach((item, index) => {
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
    `;

        // Click to play
        div.addEventListener('click', (e) => {
            if (e.target.closest('.delete-btn')) return;
            playSong(index);
        });

        // Individual deletion
        const deleteBtn = div.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeFromPlaylist(index);
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
}

async function playSong(index) {
    if (index < 0 || index >= playlist.length) return;

    const thisRequestId = ++playRequestId;
    currentIndex = index;
    const item = playlist[index];
    nowPlayingTitle.innerText = `正在播放：${item.title}`;
    renderPlaylist();

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
    if (currentIndex + 1 < playlist.length) {
        playSong(currentIndex + 1);
    } else {
        // If we've reached the end, stay at the current index but stop
        currentIndex = playlist.length - 1;
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
            case 4: msg += ' (不支援的來源或格式)'; codeName = 'MEDIA_ERR_SRC_NOT_SUPPORTED'; break;
        }
    }
    logDebug(`播放器報錯: [${codeName}] ${msg}`);
    alert(`播放失敗 (錯誤碼 ${err ? err.code : '?'}): ${msg}\n\n這通常與網路環境或 YouTube 的限制有關。請嘗試搜尋其他影片來源。`);
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

/**
 * Jungle pitch shifter implementation
 * Based on Chris Wilson's pitch shifter (which is based on a "jungle" concept)
 */
class Jungle {
    constructor(context) {
        this.context = context;
        this.input = context.createGain();
        this.output = context.createGain();

        // Delay values for the pitch shifter
        this.delayTime = 0.100; // 100ms
        this.fadeTime = 0.050; // 50ms
        this.bufferTime = 0.100;

        // Create the necessary nodes
        this.mod1 = context.createOscillator();
        this.mod2 = context.createOscillator();
        this.mod1Gain = context.createGain();
        this.mod2Gain = context.createGain();
        this.mod1Inv = context.createGain();
        this.mod1Inv.gain.value = -1;

        this.mod2Inv = context.createGain();
        this.mod2Inv.gain.value = -1;

        this.processor1 = context.createDelay(this.delayTime * 2);
        this.processor2 = context.createDelay(this.delayTime * 2);

        this.fade1 = context.createGain();
        this.fade2 = context.createGain();

        // Waveform for the crossfade
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

        // Set up the graph
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

        // Configure oscillators
        this.mod1.type = 'sawtooth';
        this.mod2.type = 'sawtooth';

        this.mod1.frequency.value = 1 / this.bufferTime;
        this.mod2.frequency.value = 1 / this.bufferTime;

        // Mod 2 is phased 180 degrees from Mod 1
        // We can't set phase directly, but we can use an offset or just let them start at different times.
        // A better way is to use a single oscillator and a delay for the second path?
        // Actually, we can use a custom periodic wave or just start them with a delay.

        this.setPitchOffset(0);

        this.mod1.start();
        this.mod2.start();
        // Shift mod2 by half a period
        // This is tricky with OscillatorNode. Let's use a workaround with 
        // a constant source and a delay if needed, but the classic Jungle used two sawtooths.
    }

    setPitchOffset(offset) {
        // Logic:
        // offset of 1.0 means an octave up.
        // offset of -1.0 means an octave down.
        // A positive speed increases delay over time, lowering pitch. 
        // A negative speed decreases delay over time, raising pitch.
        const speed = offset * this.bufferTime;

        this.mod1Gain.gain.setTargetAtTime(speed, this.context.currentTime, 0.01);
        this.mod2Gain.gain.setTargetAtTime(speed, this.context.currentTime, 0.01);

        // Ensure delay starts at a safe base value
        this.processor1.delayTime.value = this.delayTime;
        this.processor2.delayTime.value = this.delayTime;
    }
}
