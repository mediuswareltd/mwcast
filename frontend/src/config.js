// MW Cast Client Configuration
const HOST = window.location.hostname;
const IS_LOCAL = HOST === 'localhost';

export const API_BASE_URL = IS_LOCAL
  ? `http://localhost:8080`
  : `http://${HOST}:8080`;

export const WS_CHAT_URL = IS_LOCAL
  ? `ws://localhost:8080/api/v1/ws/chat`
  : `ws://${HOST}:8080/api/v1/ws/chat`;

export const WHIP_URL = (streamId) => IS_LOCAL
  ? `http://localhost:8889/live/${streamId}/whip`
  : `http://${HOST}:8889/live/${streamId}/whip`;

export const HLS_URL = (streamId) => IS_LOCAL
  ? `http://localhost:8888/live/${streamId}/index.m3u8`
  : `http://${HOST}:8888/live/${streamId}/index.m3u8`;

export const MEDIAMTX_PATH_URL = (streamId) =>
  `http://${IS_LOCAL ? 'localhost' : HOST}:9997/v3/paths/get/live/${streamId}`;
