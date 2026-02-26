import type { FrameType, PeerStatus } from '../contracts';

export type JoinDirection = 'inbound' | 'outbound';

export type JoinLifecycleState =
  | 'disconnected'
  | 'pending_inbound_approval'
  | 'pending_outbound_approval'
  | 'approved'
  | 'rejected';

export interface JoinPeerState {
  direction: JoinDirection;
  lifecycle: JoinLifecycleState;
}

export type JoinPeerEvent = 'host_approved' | 'host_rejected' | 'host_hello' | 'transport_closed';

export function createJoinPeerState(direction: JoinDirection): JoinPeerState {
  return {
    direction,
    lifecycle: direction === 'inbound' ? 'pending_inbound_approval' : 'pending_outbound_approval',
  };
}

export function transitionJoinPeerState(
  current: JoinPeerState,
  event: JoinPeerEvent,
): JoinPeerState {
  switch (current.lifecycle) {
    case 'pending_inbound_approval':
      if (event === 'host_approved') {
        return { ...current, lifecycle: 'approved' };
      }
      if (event === 'host_rejected') {
        return { ...current, lifecycle: 'rejected' };
      }
      if (event === 'transport_closed') {
        return { ...current, lifecycle: 'disconnected' };
      }
      return current;
    case 'pending_outbound_approval':
      if (event === 'host_approved' || event === 'host_hello') {
        return { ...current, lifecycle: 'approved' };
      }
      if (event === 'host_rejected') {
        return { ...current, lifecycle: 'rejected' };
      }
      if (event === 'transport_closed') {
        return { ...current, lifecycle: 'disconnected' };
      }
      return current;
    case 'approved':
      if (event === 'transport_closed') {
        return { ...current, lifecycle: 'disconnected' };
      }
      if (event === 'host_rejected') {
        return { ...current, lifecycle: 'rejected' };
      }
      return current;
    case 'rejected':
      if (event === 'transport_closed') {
        return { ...current, lifecycle: 'disconnected' };
      }
      return current;
    case 'disconnected':
      return current;
  }
}

export function isJoinApproved(state: JoinPeerState): boolean {
  return state.lifecycle === 'approved';
}

export function isJoinPendingInboundApproval(state: JoinPeerState): boolean {
  return state.lifecycle === 'pending_inbound_approval';
}

export function allowsInboundFrame(state: JoinPeerState, frameType: FrameType): boolean {
  if (state.lifecycle === 'approved') {
    return true;
  }

  if (state.lifecycle === 'pending_outbound_approval') {
    return frameType === 'hello' || frameType === 'error';
  }

  if (state.lifecycle === 'pending_inbound_approval') {
    return frameType === 'error';
  }

  return false;
}

export function allowsOutboundSync(state: JoinPeerState): boolean {
  return state.lifecycle === 'approved';
}

export function peerStatusFromJoinState(state: JoinPeerState): PeerStatus {
  if (
    state.lifecycle === 'pending_inbound_approval' ||
    state.lifecycle === 'pending_outbound_approval'
  ) {
    return 'CONNECTING';
  }

  if (state.lifecycle === 'approved') {
    return 'CONNECTED';
  }

  return 'DISCONNECTED';
}
