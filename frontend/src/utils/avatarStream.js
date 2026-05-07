/**
 * Ensures a font is loaded before drawing to canvas.
 * Falls back gracefully if FontFace API is unavailable.
 */
async function ensureFont() {
  if (typeof document === 'undefined') return;
  try {
    await document.fonts.load('bold 120px Inter');
  } catch (_) {}
}

/**
 * Builds a MediaStream with a canvas video track showing the host's initials avatar,
 * optionally combined with an audio track.
 *
 * Returns { stream, stop } — call stop() to cancel the draw loop when done.
 */
export async function buildAvatarStream(name, audioTrack = null) {
  await ensureFont();

  const initials = (name || '?')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');

  const W = 1280, H = 720;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const draw = () => {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);

    const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 320);
    grad.addColorStop(0, 'rgba(99,102,241,0.18)');
    grad.addColorStop(1, 'rgba(99,102,241,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    const cx = W / 2, cy = H / 2, r = 140;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(99,102,241,0.2)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(99,102,241,0.4)';
    ctx.stroke();

    ctx.fillStyle = '#a5b4fc';
    ctx.font = 'bold 120px Inter, ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials, cx, cy + 6);
  };

  draw();
  const iv = setInterval(draw, 100);
  const videoTrack = canvas.captureStream(10).getVideoTracks()[0];

  const stop = () => {
    clearInterval(iv);
    videoTrack.stop();
  };

  videoTrack.addEventListener('ended', stop);

  const tracks = [videoTrack];
  if (audioTrack) tracks.push(audioTrack);
  return { stream: new MediaStream(tracks), stop };
}

/**
 * Composites a camera/avatar source onto a screen share canvas so viewers see both.
 * Returns { stream, stop }.
 *
 * @param {MediaStreamTrack} screenTrack  - video track from getDisplayMedia
 * @param {MediaStreamTrack|null} camTrack - camera video track (or null for avatar)
 * @param {string} name                   - host display name (for avatar fallback)
 * @param {MediaStreamTrack|null} audioTrack
 * @returns {{ stream: MediaStream, stop: () => void }}
 */
export async function buildScreenWithPipStream(screenTrack, camTrack, name, audioTrack = null) {
  await ensureFont();

  // Get actual screen dimensions from the track
  const settings = screenTrack.getSettings();
  const W = settings.width  || 1280;
  const H = settings.height || 720;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Attach screen video to DOM (hidden) so the browser actually decodes frames
  const screenVideo = document.createElement('video');
  screenVideo.autoplay = true;
  screenVideo.muted = true;
  screenVideo.playsInline = true;
  screenVideo.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
  document.body.appendChild(screenVideo);
  screenVideo.srcObject = new MediaStream([screenTrack]);

  // Wait for the screen video to be ready before starting the loop
  await new Promise(resolve => {
    if (screenVideo.readyState >= 2) { resolve(); return; }
    screenVideo.addEventListener('canplay', resolve, { once: true });
    screenVideo.play().catch(() => {});
    setTimeout(resolve, 3000); // fallback
  });

  // PiP source — camera or avatar canvas
  let pipVideo = null;
  let avatarCanvas = null;
  let avatarIv = null;

  const PIP_W = Math.round(W * 0.2);
  const PIP_H = Math.round(PIP_W * 9 / 16);
  const PIP_PAD = 12;

  const drawAvatar = () => {
    if (!avatarCanvas) return;
    const ac = avatarCanvas.getContext('2d');
    const initials = (name || '?')
      .split(/[\s_-]+/).filter(Boolean).slice(0, 2)
      .map(w => w[0].toUpperCase()).join('');
    ac.fillStyle = '#1e1b4b';
    ac.fillRect(0, 0, PIP_W, PIP_H);
    const cx = PIP_W / 2, cy = PIP_H / 2, r = Math.round(PIP_H * 0.3);
    ac.beginPath();
    ac.arc(cx, cy, r, 0, Math.PI * 2);
    ac.fillStyle = 'rgba(99,102,241,0.4)';
    ac.fill();
    ac.fillStyle = '#a5b4fc';
    ac.font = `bold ${Math.round(r * 0.9)}px Inter, sans-serif`;
    ac.textAlign = 'center';
    ac.textBaseline = 'middle';
    ac.fillText(initials, cx, cy + 2);
  };

  if (camTrack) {
    pipVideo = document.createElement('video');
    pipVideo.autoplay = true;
    pipVideo.muted = true;
    pipVideo.playsInline = true;
    pipVideo.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(pipVideo);
    pipVideo.srcObject = new MediaStream([camTrack]);
    pipVideo.play().catch(() => {});
  } else {
    avatarCanvas = document.createElement('canvas');
    avatarCanvas.width = PIP_W;
    avatarCanvas.height = PIP_H;
    drawAvatar();
    avatarIv = setInterval(drawAvatar, 100);
  }

  const drawFrame = () => {
    // Draw full screen
    ctx.drawImage(screenVideo, 0, 0, W, H);

    // PiP position — bottom-right
    const px = W - PIP_W - PIP_PAD;
    const py = H - PIP_H - PIP_PAD;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(px, py, PIP_W, PIP_H, 8);
    ctx.clip();

    if (pipVideo && pipVideo.readyState >= 2) {
      // Mirror camera horizontally
      ctx.translate(px + PIP_W, py);
      ctx.scale(-1, 1);
      ctx.drawImage(pipVideo, 0, 0, PIP_W, PIP_H);
    } else if (avatarCanvas) {
      ctx.drawImage(avatarCanvas, px, py, PIP_W, PIP_H);
    }
    ctx.restore();

    // PiP border
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(px, py, PIP_W, PIP_H, 8);
    ctx.stroke();
  };

  drawFrame();
  const iv = setInterval(drawFrame, 1000 / 30);
  const outputTrack = canvas.captureStream(30).getVideoTracks()[0];

  const stop = () => {
    clearInterval(iv);
    if (avatarIv) clearInterval(avatarIv);
    outputTrack.stop();
    screenVideo.srcObject = null;
    document.body.removeChild(screenVideo);
    if (pipVideo) {
      pipVideo.srcObject = null;
      document.body.removeChild(pipVideo);
    }
  };

  outputTrack.addEventListener('ended', stop);

  const tracks = [outputTrack];
  if (audioTrack) tracks.push(audioTrack);
  return { stream: new MediaStream(tracks), stop };
}
