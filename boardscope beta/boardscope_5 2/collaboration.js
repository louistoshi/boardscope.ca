/**
 * BoardScope Team Collaboration
 * Real-time session sharing using WebRTC for peer-to-peer connections
 * 
 * Usage:
 *   const collab = new CollaborationSession();
 *   const roomCode = await collab.createSession();
 *   // Share roomCode with remote technician
 *   
 *   // Remote technician:
 *   await collab.joinSession(roomCode);
 * 
 * Events:
 *   'session-created' - Session created, room code available
 *   'participant-joined' - New participant joined
 *   'participant-left' - Participant disconnected
 *   'state-changed' - Remote state update received
 *   'message' - Chat message received
 *   'cursor-moved' - Remote cursor position updated
 *   'error' - Connection or sync error
 */

class CollaborationSession {
  constructor() {
    this.peer = null;
    this.connections = new Map(); // participantId -> connection
    this.roomCode = null;
    this.participants = [];
    this.isHost = false;
    this.localId = this._generateId();
    this.localName = 'Technician';
    this._listeners = {};
    this._syncThrottle = null;
    this._cursorThrottle = null;
    
    // Signaling server (public STUN/TURN)
    this.iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ];
  }
  
  // ── SESSION MANAGEMENT ──
  async createSession(name = 'Technician') {
    this.localName = name;
    this.isHost = true;
    this.roomCode = this._generateRoomCode();
    
    // Initialize PeerJS (using public PeerServer)
    try {
      // Note: In production, you'd use: new Peer(this.localId, { config: { iceServers: this.iceServers } })
      // For now, we'll simulate the connection
      this.peer = {
        id: this.localId,
        on: (event, callback) => {
          console.log('[Collaboration] Peer event:', event);
        },
        disconnect: () => {
          console.log('[Collaboration] Peer disconnected');
        }
      };
      
      this._setupPeerListeners();
      
      this.emit('session-created', { roomCode: this.roomCode, hostId: this.localId });
      console.log('[Collaboration] Session created. Room code:', this.roomCode);
      
      return this.roomCode;
      
    } catch (error) {
      console.error('[Collaboration] Create session error:', error);
      this.emit('error', { message: 'Failed to create session', error });
      return null;
    }
  }
  
  async joinSession(roomCode, name = 'Technician') {
    this.localName = name;
    this.isHost = false;
    this.roomCode = roomCode;
    
    try {
      // Connect to host via signaling
      // In production: this.peer = new Peer(this.localId, { config: { iceServers: this.iceServers } })
      this.peer = {
        id: this.localId,
        connect: (hostId) => {
          console.log('[Collaboration] Connecting to host:', hostId);
          return {
            on: (event, callback) => {},
            send: (data) => {}
          };
        }
      };
      
      // Decode room code to get host ID
      const hostId = this._decodeRoomCode(roomCode);
      const conn = this.peer.connect(hostId);
      
      this._setupConnectionListeners(conn, hostId);
      
      console.log('[Collaboration] Joined session:', roomCode);
      return true;
      
    } catch (error) {
      console.error('[Collaboration] Join session error:', error);
      this.emit('error', { message: 'Failed to join session', error });
      return false;
    }
  }
  
  leaveSession() {
    // Disconnect all connections
    this.connections.forEach(conn => {
      conn.close();
    });
    this.connections.clear();
    
    if (this.peer) {
      this.peer.disconnect();
      this.peer = null;
    }
    
    this.participants = [];
    this.roomCode = null;
    this.isHost = false;
    
    console.log('[Collaboration] Left session');
  }
  
  // ── STATE SYNCHRONIZATION ──
  syncState(state) {
    if (!this.peer || this.connections.size === 0) return;
    
    // Throttle state updates to 10Hz (100ms)
    if (this._syncThrottle) return;
    this._syncThrottle = setTimeout(() => {
      this._syncThrottle = null;
    }, 100);
    
    const message = {
      type: 'state-sync',
      from: this.localId,
      timestamp: Date.now(),
      state: state
    };
    
    this._broadcast(message);
  }
  
  syncCursor(x, y) {
    if (!this.peer || this.connections.size === 0) return;
    
    // Throttle cursor updates to 30Hz (~33ms)
    if (this._cursorThrottle) return;
    this._cursorThrottle = setTimeout(() => {
      this._cursorThrottle = null;
    }, 33);
    
    const message = {
      type: 'cursor',
      from: this.localId,
      x: x,
      y: y
    };
    
    this._broadcast(message);
  }
  
  sendMessage(text) {
    if (!this.peer || this.connections.size === 0) return;
    
    const message = {
      type: 'chat',
      from: this.localId,
      name: this.localName,
      text: text,
      timestamp: Date.now()
    };
    
    this._broadcast(message);
    
    // Emit locally too
    this.emit('message', message);
  }
  
  sendAnnotation(annotation) {
    if (!this.peer || this.connections.size === 0) return;
    
    const message = {
      type: 'annotation',
      from: this.localId,
      annotation: annotation,
      timestamp: Date.now()
    };
    
    this._broadcast(message);
  }
  
  _broadcast(message) {
    this.connections.forEach(conn => {
      try {
        conn.send(message);
      } catch (error) {
        console.error('[Collaboration] Broadcast error:', error);
      }
    });
  }
  
  // ── CONNECTION SETUP ──
  _setupPeerListeners() {
    if (!this.peer) return;
    
    this.peer.on('connection', (conn) => {
      console.log('[Collaboration] Incoming connection from:', conn.peer);
      this._setupConnectionListeners(conn, conn.peer);
    });
    
    this.peer.on('error', (error) => {
      console.error('[Collaboration] Peer error:', error);
      this.emit('error', { message: 'Connection error', error });
    });
  }
  
  _setupConnectionListeners(conn, participantId) {
    conn.on('open', () => {
      console.log('[Collaboration] Connection opened:', participantId);
      
      this.connections.set(participantId, conn);
      
      const participant = {
        id: participantId,
        name: 'Remote Technician',
        color: this._generateColor(),
        joinedAt: Date.now()
      };
      
      this.participants.push(participant);
      this.emit('participant-joined', participant);
      
      // Send current state to new participant
      if (this.isHost) {
        this._sendCurrentState(conn);
      }
    });
    
    conn.on('data', (data) => {
      this._handleMessage(data, participantId);
    });
    
    conn.on('close', () => {
      console.log('[Collaboration] Connection closed:', participantId);
      this.connections.delete(participantId);
      
      const index = this.participants.findIndex(p => p.id === participantId);
      if (index !== -1) {
        const participant = this.participants[index];
        this.participants.splice(index, 1);
        this.emit('participant-left', participant);
      }
    });
    
    conn.on('error', (error) => {
      console.error('[Collaboration] Connection error:', error);
    });
  }
  
  _handleMessage(message, fromId) {
    switch (message.type) {
      case 'state-sync':
        this.emit('state-changed', { from: fromId, state: message.state });
        break;
      case 'cursor':
        this.emit('cursor-moved', { from: fromId, x: message.x, y: message.y });
        break;
      case 'chat':
        this.emit('message', message);
        break;
      case 'annotation':
        this.emit('annotation', { from: fromId, annotation: message.annotation });
        break;
      case 'request-state':
        if (this.isHost) {
          this._sendCurrentState(this.connections.get(fromId));
        }
        break;
      default:
        console.warn('[Collaboration] Unknown message type:', message.type);
    }
  }
  
  _sendCurrentState(conn) {
    // Send current BoardScope state to new participant
    const state = {
      boardFile: window.currentBoardFile || null,
      pdfFile: window.currentPdfFile || null,
      selectedComponent: window.selectedComponent || null,
      highlightedNets: window.highlightedNets || [],
      measurements: window.measurements || {},
      pdfPage: window.currentPdfPage || 1,
      zoom: window.currentZoom || 1.0
    };
    
    conn.send({
      type: 'initial-state',
      state: state,
      timestamp: Date.now()
    });
  }
  
  // ── UTILITY ──
  _generateRoomCode() {
    // Generate 6-digit room code
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
  
  _generateId() {
    return 'user-' + Math.random().toString(36).substr(2, 9);
  }
  
  _generateColor() {
    const colors = ['#00d9a6', '#5294f8', '#f5a623', '#f05050', '#c080ff', '#00d9ff'];
    return colors[Math.floor(Math.random() * colors.length)];
  }
  
  _encodeRoomCode(peerId) {
    // Simple encoding: room code is just first 6 chars of peer ID
    return peerId.substr(0, 6).toUpperCase();
  }
  
  _decodeRoomCode(roomCode) {
    // In production, this would query a signaling server
    // For now, return a mock peer ID
    return 'host-' + roomCode.toLowerCase();
  }
  
  // ── EVENT BUS ──
  on(event, callback) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(callback);
  }
  
  emit(event, data) {
    if (!this._listeners[event]) return;
    this._listeners[event].forEach(cb => cb(data));
  }
  
  // ── STATUS ──
  getStatus() {
    return {
      connected: this.peer !== null,
      isHost: this.isHost,
      roomCode: this.roomCode,
      participantCount: this.participants.length,
      participants: this.participants
    };
  }
  
  getParticipants() {
    return this.participants;
  }
}

// Export for use in BoardScope
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CollaborationSession;
}
