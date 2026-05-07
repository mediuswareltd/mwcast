// MW Cast Client Configuration
const HOST = window.location.hostname;
const PROTOCOL = window.location.protocol; // http: or https:
const IS_LOCAL = HOST === 'localhost';

export const API_BASE_URL = `${PROTOCOL}//${HOST}`;

export const WS_CHAT_URL = PROTOCOL === 'https:'
  ? `wss://${HOST}/api/v1/ws/chat`
  : `ws://${HOST}/api/v1/ws/chat`;

export const WHIP_URL = (streamId) => `${PROTOCOL}//${HOST}/webrtc/live/${streamId}/whip`;

export const WHEP_URL = (streamId) => `${PROTOCOL}//${HOST}/webrtc/live/${streamId}/whep`;

export const HLS_URL = (streamId) => `${PROTOCOL}//${HOST}/hls/live/${streamId}/index.m3u8`;

export const MEDIAMTX_PATH_URL = (streamId) =>
  `${PROTOCOL}//${HOST}/mediamtx/v3/paths/get/live/${streamId}`;
