import { describe, expect, it } from 'vitest';

import {
  allowsInboundFrame,
  allowsOutboundSync,
  createJoinPeerState,
  isJoinApproved,
  isJoinPendingInboundApproval,
  peerStatusFromJoinState,
  transitionJoinPeerState,
} from './join-fsm';

describe('join fsm', () => {
  it('starts inbound peers in pending approval state', () => {
    const state = createJoinPeerState('inbound');

    expect(isJoinPendingInboundApproval(state)).toBe(true);
    expect(peerStatusFromJoinState(state)).toBe('CONNECTING');
    expect(allowsInboundFrame(state, 'update')).toBe(false);
  });

  it('allows outbound pending peers to receive host hello', () => {
    const pendingOutbound = createJoinPeerState('outbound');

    expect(allowsInboundFrame(pendingOutbound, 'hello')).toBe(true);
    expect(allowsInboundFrame(pendingOutbound, 'update')).toBe(false);

    const approved = transitionJoinPeerState(pendingOutbound, 'host_hello');
    expect(isJoinApproved(approved)).toBe(true);
    expect(peerStatusFromJoinState(approved)).toBe('CONNECTED');
    expect(allowsOutboundSync(approved)).toBe(true);
  });

  it('moves to rejected and then disconnected on close', () => {
    const pendingInbound = createJoinPeerState('inbound');
    const rejected = transitionJoinPeerState(pendingInbound, 'host_rejected');
    const disconnected = transitionJoinPeerState(rejected, 'transport_closed');

    expect(peerStatusFromJoinState(rejected)).toBe('DISCONNECTED');
    expect(allowsInboundFrame(rejected, 'hello')).toBe(false);
    expect(peerStatusFromJoinState(disconnected)).toBe('DISCONNECTED');
  });
});
