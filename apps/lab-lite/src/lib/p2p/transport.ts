/**
 * Story 49.3: P2P Transport Layer Abstraction
 *
 * Defines the transport interface that all P2P backends (LocalNetwork, BLE)
 * must implement. The upper layers (handshake, transfer-protocol) only depend
 * on this interface — swapping transports does not change protocol logic.
 *
 * Dev Notes:
 * - PWA cannot advertise as BLE peripheral (Web Bluetooth limitation).
 * - Primary transport: LocalNetwork via BroadcastChannel (same device) or WebRTC.
 * - Secondary transport: BLE central-only via Web Bluetooth API.
 * - Neither transport requires internet or Hub connectivity (AC #7).
 */

export interface DiscoveredDevice {
  id: string
  name: string
  type: 'ble' | 'wifi-direct' | 'local-network'
  signalStrength?: number
}

export interface P2PConnection {
  deviceId: string
  deviceName: string
  send(data: ArrayBuffer): Promise<void>
  onReceive(handler: (data: ArrayBuffer) => void): void
  close(): void
  onDisconnect(handler: () => void): void
}

export interface ServiceInfo {
  serviceId: string
  deviceName: string
  appType: 'lab-lite' | 'opd-lite'
}

export interface P2PTransport {
  startDiscovery(): Promise<DiscoveredDevice[]>
  stopDiscovery(): void
  connect(device: DiscoveredDevice): Promise<P2PConnection>
  advertise(serviceInfo: ServiceInfo): Promise<void>
  onIncomingConnection(handler: (conn: P2PConnection) => void): void
}

/** Get the best available transport for the current environment. */
export function selectTransport(): 'local-network' | 'ble' | 'none' {
  // Primary: local network via BroadcastChannel (same-device) or WebRTC
  if (typeof BroadcastChannel !== 'undefined') {
    return 'local-network'
  }
  // Secondary: BLE central role (requires navigator.bluetooth)
  if (typeof navigator !== 'undefined' && 'bluetooth' in navigator) {
    return 'ble'
  }
  return 'none'
}
