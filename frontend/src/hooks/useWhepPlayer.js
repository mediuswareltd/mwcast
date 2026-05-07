import { useRef, useCallback } from 'react';
import { WHEP_URL } from '../config';

/**
 * Subscribes to a MediaMTX stream via WHEP (WebRTC egress).
 * Returns { subscribe, unsubscribe }.
 * subscribe(streamId, videoEl) — attaches the stream to a <video> element.
 */
export function useWhepPlayer() {
  const pcRef = useRef(null);

  const unsubscribe = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
  }, []);

  const subscribe = useCallback(async (streamId, videoEl) => {
    unsubscribe();

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    pcRef.current = pc;

    // We only want to receive — add recvonly transceivers
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });

    pc.ontrack = (event) => {
      if (videoEl && event.streams[0]) {
        videoEl.srcObject = event.streams[0];
        videoEl.play().catch(() => {});
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Wait for ICE gathering
    await new Promise(resolve => {
      if (pc.iceGatheringState === 'complete') return resolve();
      pc.addEventListener('icegatheringstatechange', () => {
        if (pc.iceGatheringState === 'complete') resolve();
      });
      setTimeout(resolve, 2000);
    });

    if (pc.signalingState === 'closed') return;

    const res = await fetch(WHEP_URL(streamId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp' },
      body: pc.localDescription.sdp,
    });

    if (!res.ok) throw new Error(`WHEP rejected: ${res.status}`);

    const answerSdp = await res.text();
    if (pc.signalingState === 'closed') return;

    await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    return pc;
  }, [unsubscribe]);

  return { subscribe, unsubscribe };
}
