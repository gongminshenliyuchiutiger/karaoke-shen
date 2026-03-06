import eel
import yt_dlp
import os
import sys
import requests
import socket
from bottle import response, request, static_file

# Handle resource paths for PyInstaller
base_dir = os.path.dirname(os.path.abspath(__file__))
web_dir = os.path.join(base_dir, 'web')

def ensure_utf8(text):
    """Deep check/fix for mojibake. Bottle on Windows sometimes interprets UTF8 as Latin1."""
    if not text: return ""
    try:
        # If it's already correct, this might fail or do nothing
        # But if it's mojibake (Latin1 representing UTF8), this fixes it
        return text.encode('latin-1').decode('utf-8')
    except (UnicodeEncodeError, UnicodeDecodeError):
        return text

# Configure yt-dlp
# Search needs to be fast and metadata-focused
SEARCH_OPTS = {
    'quiet': True,
    'no_warnings': True,
    'extract_flat': True,
}

# Streaming needs to be strictly compatible with browser
# Without ffmpeg, we MUST use pre-merged legacy formats (18=360p, 22=720p)
STREAM_OPTS = {
    'format': '18/22/best[ext=mp4][vcodec^=avc1][acodec^=mp4a]/best',
    'quiet': True,
    'no_warnings': True,
    'nocheckcertificate': True,
    'youtube_include_dash_manifest': False,
    'youtube_include_hls_manifest': False,
    'noplaylist': True,
    'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
}

@eel.expose
def search_youtube(query, count=20):
    """Search for videos on YouTube using keywords."""
    print(f"Searching for: {query} (count: {count})")
    try:
        with yt_dlp.YoutubeDL(SEARCH_OPTS) as ydl:
            # Get results based on count
            search_results = ydl.extract_info(f"ytsearch{count}:{query}", download=False)
            if not search_results:
                print("No results found or search failed.")
                return []
            
            results = []
            entries = search_results.get('entries', [])
            print(f"Found {len(entries)} entries.")
            
            for entry in entries:
                if entry:
                    # Robust thumbnail selection
                    thumb = entry.get('thumbnail')
                    if not thumb and entry.get('thumbnails'):
                        # Try to get high quality thumbnail
                        thumb = entry.get('thumbnails')[-1].get('url')
                        
                    results.append({
                        'id': entry.get('id'),
                        'title': entry.get('title'),
                        'thumbnail': thumb,
                        'url': f"https://www.youtube.com/watch?v={entry.get('id')}"
                    })
            return results
    except Exception as e:
        import traceback
        print(f"Search error details: {e}")
        traceback.print_exc()
        return []

@eel.expose
def get_video_info(url):
    """Get info for a single video from a direct URL."""
    print(f"Getting info for URL: {url}")
    try:
        with yt_dlp.YoutubeDL(SEARCH_OPTS) as ydl:
            info = ydl.extract_info(url, download=False)
            if not info:
                print("Failed to get video info.")
                return None
            
            thumb = info.get('thumbnail')
            if not thumb and info.get('thumbnails'):
                thumb = info.get('thumbnails')[-1].get('url')

            return {
                'id': info.get('id'),
                'title': info.get('title'),
                'thumbnail': thumb,
                'url': url
            }
    except Exception as e:
        print(f"Info error details: {e}")
        return None

@eel.expose
def get_stream_url(video_id):
    """Get the local proxy URL for a YouTube video."""
    # ALWAYS use the detected local IP to ensure consistency with server binding
    ip = get_local_ip()
    return f"http://{ip}:8000/proxy_stream?v={video_id}"

@eel.expose
def get_local_ip():
    """Get the local IP address of the machine."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # doesn't even have to be reachable
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
        
    if IP == '0.0.0.0' or IP.startswith('169.254.'):
        # Fallback to checking hostname
        try:
            hostname = socket.gethostname()
            IP = socket.gethostbyname(hostname)
        except:
            IP = '127.0.0.1'
            
    # Final safety net
    if IP == '0.0.0.0':
        IP = '127.0.0.1'
        
    return IP

@eel.expose
def add_song_remotely(video_id, title, thumbnail):
    """Bridge function for mobile to add songs to the main window."""
    print(f"Remote command: Adding {title}")
    # Call a JS function in the main window
    eel.js_add_to_playlist({'id': video_id, 'title': title, 'thumbnail': thumbnail})
    return True

@eel.expose
def get_playlist_from_mobile():
    """Request playlist and current index from the main window and return to mobile."""
    # This calls back to the main window's JS
    return eel.js_get_playlist()()

@eel.expose
def remote_play_index(index):
    """Bridge for mobile to play a specific song by index."""
    print(f"Remote command: Play song at index {index}")
    eel.js_play_index(index)
    return True

@eel.expose
def reorder_playlist_remotely(from_idx, to_idx):
    """Bridge for mobile to reorder songs."""
    eel.js_reorder_playlist(from_idx, to_idx)
    return True

@eel.expose
def delete_song_remotely(index):
    """Bridge for mobile to delete songs."""
    eel.js_delete_from_playlist(index)
    return True

@eel.expose
def remote_play_pause():
    """Bridge for mobile to toggle playback in main window."""
    print("Remote command: Toggle Play/Pause")
    eel.js_toggle_play_pause()
    return True

@eel.expose
def remote_skip_song():
    """Bridge for mobile to skip song in main window."""
    print("Remote command: Skip Song")
    eel.js_skip_song()
    return True

@eel.btl.route('/mobile')
def mobile_page():
    return static_file('mobile.html', root=web_dir)

@eel.btl.route('/mobile_search')
def mobile_search():
    import json
    from bottle import HTTPResponse
    query = ensure_utf8(request.query.get('q'))
    if not query:
        return HTTPResponse(body=json.dumps({"results": []}), status=200, headers={'Content-Type': 'application/json; charset=utf-8'})
    
    # We call the internal search logic
    res = search_youtube(query)
    
    # Explicitly construct response with UTF-8 header and body
    json_data = json.dumps({"results": res}, ensure_ascii=False)
    return HTTPResponse(
        body=json_data.encode('utf-8'),
        status=200,
        headers={'Content-Type': 'application/json; charset=utf-8'}
    )

@eel.btl.route('/mobile_add')
def mobile_add():
    video_id = ensure_utf8(request.query.get('id'))
    title = ensure_utf8(request.query.get('title'))
    thumb = ensure_utf8(request.query.get('thumb'))
    add_song_remotely(video_id, title, thumb)
    return {"status": "success"}

@eel.btl.route('/mobile_get_playlist')
def mobile_get_playlist():
    data = get_playlist_from_mobile()
    return data or {"playlist": [], "currentIndex": -1}

@eel.btl.route('/mobile_play_idx')
def mobile_play_idx():
    idx = int(request.query.get('index', -1))
    if idx != -1:
        remote_play_index(idx)
    return {"status": "success"}

@eel.btl.route('/mobile_reorder')
def mobile_reorder():
    f = int(request.query.get('from', -1))
    t = int(request.query.get('to', -1))
    if f != -1 and t != -1:
        reorder_playlist_remotely(f, t)
    return {"status": "success"}

@eel.btl.route('/mobile_delete')
def mobile_delete():
    idx = int(request.query.get('index', -1))
    if idx != -1:
        delete_song_remotely(idx)
    return {"status": "success"}

@eel.btl.route('/mobile_play_pause')
def mobile_play_pause():
    remote_play_pause()
    return {"status": "success"}

@eel.btl.route('/mobile_skip')
def mobile_skip():
    remote_skip_song()
    return {"status": "success"}

@eel.btl.route('/proxy_stream')
def proxy_stream():
    video_id = ensure_utf8(request.query.get('v'))
    if not video_id:
        return "Missing video id"
    
    url = f"https://www.youtube.com/watch?v={video_id}"
    print(f"--- [PROXY] Streaming: {video_id} ---")
    
    try:
        with yt_dlp.YoutubeDL(STREAM_OPTS) as ydl:
            info = ydl.extract_info(url, download=False)
            
            # Select format 18 or 22 (legacy combined)
            best_f = None
            for fid in ['18', '22']:
                best_f = next((f for f in info.get('formats', []) if f.get('format_id') == fid), None)
                if best_f: break
            
            if not best_f:
                # Fallback to any merged mp4 (video + audio)
                for f in info.get('formats', []):
                    if f.get('ext') == 'mp4' and f.get('vcodec') != 'none' and f.get('acodec') != 'none':
                        best_f = f
                        break
            
            if not best_f:
                # Last resort: just pick the best overall format yt-dlp suggests
                best_f = info.get('formats', [None])[0]
            
            if not best_f:
                return "No compatible format found"
            
            stream_url = best_f.get('url')
            
            # Use requests to stream the content
            headers = {
                'User-Agent': STREAM_OPTS['user_agent'],
                'Range': request.headers.get('Range', 'bytes=0-')
            }
            
            req = requests.get(stream_url, headers=headers, stream=True)
            
            # Set response headers
            response.set_header('Content-Type', 'video/mp4')
            response.set_header('Accept-Ranges', 'bytes')
            response.set_header('Access-Control-Allow-Origin', '*')
            
            # Relay the status code (crucial for 206 Partial Content during seeking)
            response.status = req.status_code
            
            if 'Content-Range' in req.headers:
                response.set_header('Content-Range', req.headers['Content-Range'])
            if 'Content-Length' in req.headers:
                response.set_header('Content-Length', req.headers['Content-Length'])
            
            # Return the generator to stream data
            return req.iter_content(chunk_size=1024*1024)
            
    except Exception as e:
        print(f"[PROXY ERROR] {e}")
        return str(e)

def main():
    # Initialize Eel with the 'web' directory
    print(f"Initializing Eel with web directory: {web_dir}")
    eel.init(web_dir)
    
    # Try to start the app
    try:
        ip = get_local_ip()
        print(f"Starting server on {ip}:8000")
        eel.start('index.html', size=(1200, 900), mode='chrome', host=ip, port=8000)
    except (SystemExit, KeyboardInterrupt):
        print("Closing application...")
    except Exception as e:
        print(f"Error starting Eel: {e}")

if __name__ == "__main__":
    main()
