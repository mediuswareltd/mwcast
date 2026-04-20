// MW Cast Client Configuration
const HOST = window.location.hostname;
const IS_LOCAL = HOST === 'localhost';

export const API_BASE_URL = IS_LOCAL
  ? `https://localhost`
  : `https://${HOST}`;

export const WS_CHAT_URL = IS_LOCAL
  ? `wss://localhost/api/v1/ws/chat`
  : `wss://${HOST}/api/v1/ws/chat`;

export const WHIP_URL = (streamId) => IS_LOCAL
  ? `https://localhost/webrtc/live/${streamId}/whip`
  : `https://${HOST}/webrtc/live/${streamId}/whip`;

export const WHEP_URL = (streamId) => IS_LOCAL
  ? `https://localhost/webrtc/live/${streamId}/whep`
  : `https://${HOST}/webrtc/live/${streamId}/whep`;

export const HLS_URL = (streamId) => IS_LOCAL
  ? `https://localhost/hls/live/${streamId}/index.m3u8`
  : `https://${HOST}/hls/live/${streamId}/index.m3u8`;

export const MEDIAMTX_PATH_URL = (streamId) =>
  `https://${HOST}/mediamtx/v3/paths/get/live/${streamId}`;

