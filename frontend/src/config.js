// MW Cast Client Configuration
// This helps bridge the gap between the frontend development server and the backend Dockerized services.

const HOST = window.location.hostname;
const PORT_BACKEND = 8080;
const PORT_HLS = 8888;
const PORT_WEBRTC = 8889;

export const API_BASE_URL = HOST === 'localhost'
  ? `http://localhost:${PORT_BACKEND}`
  : `http://${HOST}:${PORT_BACKEND}`;

export const WS_CHAT_URL = HOST === 'localhost'
  ? `ws://localhost:${PORT_BACKEND}/api/v1/ws/chat`
  : `ws://${HOST}:${PORT_BACKEND}/api/v1/ws/chat`;

// MediaMTX WHIP endpoint — browser pushes WebRTC stream here
export const WHIP_URL = (streamId) =>
  HOST === 'localhost'
    ? `http://localhost:${PORT_WEBRTC}/${streamId}/whip`
    : `http://${HOST}:${PORT_WEBRTC}/${streamId}/whip`;

// HLS playback for viewers
export const HLS_URL = (streamId) =>
  HOST === 'localhost'
    ? `http://localhost:${PORT_HLS}/${streamId}/index.m3u8`
    : `http://${HOST}:${PORT_HLS}/${streamId}/index.m3u8`;

// MediaMTX API — check if a path is live
export const MEDIAMTX_PATH_URL = (streamId) =>
  `http://localhost:9997/v3/paths/get/${streamId}`;
