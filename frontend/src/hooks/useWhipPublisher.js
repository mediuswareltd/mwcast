import { useRef, useCallback } from 'react';
import { WHIP_URL } from '../config';

/**
 * Publishes a MediaStream to MediaMTX via the WHIP protocol.
 * WHIP = WebRTC-HTTP Ingestion Protocol (RFC draft)
 * MediaMTX exposes it at: POST /{streamId}/whip
 */
export function useWhipPublisher() {
  const pcRef = useRef(null);

  const publish = useCallback(async (streamId, mediaStream) => {
    // Clean up any existing connection
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    pcRef.current = pc;

    // Add all tracks from the media stream
    mediaStream.getTracks().forEach(track => pc.addTrack(track, mediaStream));

    // Create offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Wait for ICE gathering to complete
    await new Promise(resolve => {
      if (pc.iceGatheringState === 'complete') return resolve();
      pc.addEventListener('icegatheringstatechange', () => {
        if (pc.iceGatheringState === 'complete') resolve();
      });
      // Fallback timeout — send with trickle ICE candidates after 2s
      setTimeout(resolve, 2000);
    });

    // Send offer to MediaMTX WHIP endpoint
    const res = await fetch(WHIP_URL(streamId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp' },
      body: pc.localDescription.sdp,
    });

    if (!res.ok) {
      throw new Error(`WHIP offer rejected: ${res.status} ${res.statusText}`);
    }

    const answerSdp = await res.text();
    await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

    return pc;
  }, []);

  const stop = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
  }, []);

  return { publish, stop };
}
