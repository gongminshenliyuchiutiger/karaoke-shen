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

let playlist = [];
let currentIndex = -1;

function logDebug(msg) {
    // Only console log now that the debug UI is removed
    console.log(`[DEBUG] ${msg}`);
}

// Web Audio API Context
let audioCtx;
let source;
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

    source.connect(dryGain);
    dryGain.connect(audioCtx.destination);

    // Karaoke Path
    source.connect(splitter);

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
        alert('系統錯誤：找不到 Eel 核心元件。請確保您是透過執行 Python 程式 (python main.py) 來開啟此介面，而不是直接點開 HTML 檔案時出現。');
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
        if (!streamUrl) {
            throw new Error('後端回傳網址為空');
        }

        logDebug(`取得網址: ${streamUrl.substring(0, 50)}...`);

        player.src = streamUrl;

        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        await player.play().catch(e => {
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
exportBtn.addEventListener('click', () => {
    if (playlist.length === 0) return alert('目前沒有待播歌曲可以匯出。');
    const data = JSON.stringify(playlist, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `karaoke_playlist_${new Date().getTime()}.json`;
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
