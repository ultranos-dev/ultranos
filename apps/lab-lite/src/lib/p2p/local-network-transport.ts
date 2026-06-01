/**
 * Story 49.3: Local Network Transport
 *
 * Primary P2P transport implementation. Uses BroadcastChannel for same-device
 * tab-to-tab communication (useful for dev/testing) and provides the connection
 * abstraction for WebRTC-based cross-device transfers initiated via QR code.
 *
 * Architecture note (Dev Notes):
 * - Same-device: BroadcastChannel provides bidirectional messaging instantly.
 * - Cross-device: WebRTC DataChannel after QR-bootstrapped signaling.
 *   The QR code contains { ip, port, sessionId, publicKey } — no PHI.
 * - No mDNS dependency: QR code sidesteps unreliable multicast DNS.
 * - No cloud relay: all signaling is local (no internet required, AC #7).
 */

import type { DiscoveredDevice, P2PConnection, P2PTransport, ServiceInfo } from './transport'

const BROADCAST_CHANNEL_NAME = 'ultranos-p2p-discovery'
const BROADCAST_SERVICE_PREFIX = 'ultranos-p2p-svc-'

// ---------------------------------------------------------------------------
// BroadcastChannel connection (same-device, two tabs)
// ---------------------------------------------------------------------------

class BroadcastChannelConnection implements P2PConnection {
  readonly deviceId: string
  readonly deviceName: string

  private channel: BroadcastChannel
  private receiveHandlers: Array<(data: ArrayBuffer) => void> = []
  private disconnectHandlers: Array<() => void> = []

  constructor(channelName: string, deviceId: string, deviceName: string) {
    this.deviceId = deviceId
    this.deviceName = deviceName
    this.channel = new BroadcastChannel(channelName)
    this.channel.addEventListener('message', (evt: MessageEvent) => {
      if (evt.data instanceof ArrayBuffer) {
        this.receiveHandlers.forEach((h) => h(evt.data as ArrayBuffer))
      } else if (evt.data?.type === '__p2p_close') {
        this.disconnectHandlers.forEach((h) => h())
      }
    })
  }

  async send(data: ArrayBuffer): Promise<void> {
    this.channel.postMessage(data)
  }

  onReceive(handler: (data: ArrayBuffer) => void): void {
    this.receiveHandlers.push(handler)
  }

  close(): void {
    this.channel.postMessage({ type: '__p2p_close' })
    this.channel.close()
    this.disconnectHandlers.forEach((h) => h())
  }

  onDisconnect(handler: () => void): void {
    this.disconnectHandlers.push(handler)
  }
}

// ---------------------------------------------------------------------------
// LocalNetworkTransport — BroadcastChannel (same-device) + WebRTC stubs
// ---------------------------------------------------------------------------

export class LocalNetworkTransport implements P2PTransport {
  private discoveryChannel: BroadcastChannel | null = null
  private serviceInfo: ServiceInfo | null = null
  private incomingConnectionHandlers: Array<(conn: P2PConnection) => void> = []
  private discovering = false

  /**
   * Broadcast a presence beacon and collect responses from other Lab-Lite /
   * OPD-Lite tabs on the same device. Works without network — pure in-browser.
   *
   * For cross-device discovery, callers should fall back to QR code flow:
   * generate a QR code containing { ip, sessionId, publicKey } and let the
   * receiver scan it to initiate the WebRTC offer.
   */
  async startDiscovery(): Promise<DiscoveredDevice[]> {
    this.discovering = true
    const discovered: DiscoveredDevice[] = []
    const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME)

    return new Promise<DiscoveredDevice[]>((resolve) => {
      channel.addEventListener('message', (evt: MessageEvent) => {
        if (evt.data?.type === 'PRESENCE_BEACON' && evt.data?.deviceId) {
          const existing = discovered.find((d) => d.id === evt.data.deviceId)
          if (!existing) {
            discovered.push({
              id: evt.data.deviceId as string,
              name: evt.data.deviceName as string,
              type: 'local-network',
            })
          }
        }
      })

      // Broadcast our own presence so other instances can discover us too
      if (this.serviceInfo) {
        channel.postMessage({
          type: 'PRESENCE_BEACON',
          deviceId: this.serviceInfo.serviceId,
          deviceName: this.serviceInfo.deviceName,
          appType: this.serviceInfo.appType,
        })
      }

      // Collect responses for 2 seconds
      const timeoutId = setTimeout(() => {
        channel.close()
        this.discovering = false
        resolve(discovered)
      }, 2000)

      // Allow early resolve via stopDiscovery
      this.stopDiscovery = () => {
        clearTimeout(timeoutId)
        channel.close()
        this.discovering = false
        resolve(discovered)
      }
    })
  }

  stopDiscovery(): void {
    this.discovering = false
  }

  async advertise(serviceInfo: ServiceInfo): Promise<void> {
    this.serviceInfo = serviceInfo
    if (this.discoveryChannel) {
      this.discoveryChannel.close()
    }
    this.discoveryChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME)
    this.discoveryChannel.addEventListener('message', (evt: MessageEvent) => {
      if (evt.data?.type === 'PRESENCE_BEACON') {
        // Echo back so the scanning party can see us
        this.discoveryChannel?.postMessage({
          type: 'PRESENCE_BEACON',
          deviceId: serviceInfo.serviceId,
          deviceName: serviceInfo.deviceName,
          appType: serviceInfo.appType,
        })
      } else if (evt.data?.type === 'CONNECT_REQUEST' && evt.data?.targetId === serviceInfo.serviceId) {
        const channelName = `${BROADCAST_SERVICE_PREFIX}${evt.data.sessionId as string}`
        const conn = new BroadcastChannelConnection(channelName, evt.data.sourceId as string, evt.data.sourceName as string)
        this.incomingConnectionHandlers.forEach((h) => h(conn))
      }
    })
  }

  async connect(device: DiscoveredDevice): Promise<P2PConnection> {
    const sessionId = crypto.randomUUID()
    const channelName = `${BROADCAST_SERVICE_PREFIX}${sessionId}`

    // Notify the remote end to open the same channel
    const signalChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME)
    signalChannel.postMessage({
      type: 'CONNECT_REQUEST',
      targetId: device.id,
      sourceId: this.serviceInfo?.serviceId ?? crypto.randomUUID(),
      sourceName: this.serviceInfo?.deviceName ?? 'Lab-Lite',
      sessionId,
    })
    signalChannel.close()

    const conn = new BroadcastChannelConnection(
      channelName,
      device.id,
      device.name,
    )
    return conn
  }

  onIncomingConnection(handler: (conn: P2PConnection) => void): void {
    this.incomingConnectionHandlers.push(handler)
  }
}
