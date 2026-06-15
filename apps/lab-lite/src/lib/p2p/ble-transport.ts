/**
 * Story 49.3: BLE Transport (Secondary)
 *
 * Uses the Web Bluetooth API in BLE central role (scanning/connecting to peripherals).
 * PWA limitation: cannot advertise as BLE peripheral, so OPD-Lite must expose a
 * BLE GATT service via a native wrapper (Capacitor/Tauri) for this to work.
 *
 * Feature detection: always check `isBleAvailable()` before instantiating.
 * Falls back gracefully to null — callers must handle the unavailability case.
 *
 * Dev Notes:
 * - This transport is SECONDARY. LocalNetworkTransport is primary.
 * - BLE MTU is typically 20-512 bytes; chunked transfer handles this (16KB chunks).
 * - No PHI in BLE advertisement: service UUID is static, device name is lab/OPD display name.
 */

import type { DiscoveredDevice, P2PConnection, P2PTransport, ServiceInfo } from './transport'

// Ultranos P2P service UUID — registered custom 128-bit UUID (no PHI)
const ULTRANOS_P2P_SERVICE_UUID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
const ULTRANOS_P2P_CHAR_UUID = '6ba7b811-9dad-11d1-80b4-00c04fd430c8'

export function isBleAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator
}

// ---------------------------------------------------------------------------
// BLE GATT connection adapter
// ---------------------------------------------------------------------------

class BleConnection implements P2PConnection {
  readonly deviceId: string
  readonly deviceName: string

  private characteristic: BluetoothRemoteGATTCharacteristic
  private receiveHandlers: Array<(data: ArrayBuffer) => void> = []
  private disconnectHandlers: Array<() => void> = []
  private bleDevice: BluetoothDevice

  constructor(
    bleDevice: BluetoothDevice,
    characteristic: BluetoothRemoteGATTCharacteristic,
  ) {
    this.bleDevice = bleDevice
    this.characteristic = characteristic
    this.deviceId = bleDevice.id
    this.deviceName = bleDevice.name ?? 'Unknown BLE Device'

    characteristic.addEventListener('characteristicvaluechanged', (evt) => {
      const target = evt.target as BluetoothRemoteGATTCharacteristic
      if (target.value) {
        this.receiveHandlers.forEach((h) => h(target.value!.buffer))
      }
    })

    bleDevice.addEventListener('gattserverdisconnected', () => {
      this.disconnectHandlers.forEach((h) => h())
    })
  }

  async send(data: ArrayBuffer): Promise<void> {
    await this.characteristic.writeValueWithResponse(data)
  }

  onReceive(handler: (data: ArrayBuffer) => void): void {
    this.receiveHandlers.push(handler)
    void this.characteristic.startNotifications()
  }

  close(): void {
    this.bleDevice.gatt?.disconnect()
  }

  onDisconnect(handler: () => void): void {
    this.disconnectHandlers.push(handler)
  }
}

// ---------------------------------------------------------------------------
// BleTransport
// ---------------------------------------------------------------------------

export class BleTransport implements P2PTransport {
  private incomingHandlers: Array<(conn: P2PConnection) => void> = []

  /**
   * Scan for nearby BLE devices advertising the Ultranos P2P service.
   * Requires user gesture in browsers (cannot auto-scan).
   */
  async startDiscovery(): Promise<DiscoveredDevice[]> {
    if (!isBleAvailable()) {
      return []
    }
    try {
      const device = await (navigator as Navigator & { bluetooth: Bluetooth }).bluetooth.requestDevice({
        filters: [{ services: [ULTRANOS_P2P_SERVICE_UUID] }],
        optionalServices: [ULTRANOS_P2P_SERVICE_UUID],
      })
      return [
        {
          id: device.id,
          name: device.name ?? 'OPD-Lite Device',
          type: 'ble',
        },
      ]
    } catch {
      // User cancelled or BLE unavailable
      return []
    }
  }

  stopDiscovery(): void {
    // BLE scanning stops when the requestDevice promise settles
  }

  async connect(device: DiscoveredDevice): Promise<P2PConnection> {
    if (!isBleAvailable()) {
      throw new Error('BLE not available on this device')
    }
    // Re-request the specific device to get a BluetoothDevice handle
    const bleDevice = await (navigator as Navigator & { bluetooth: Bluetooth }).bluetooth.requestDevice({
      filters: [{ services: [ULTRANOS_P2P_SERVICE_UUID] }],
    })
    const server = await bleDevice.gatt!.connect()
    const service = await server.getPrimaryService(ULTRANOS_P2P_SERVICE_UUID)
    const characteristic = await service.getCharacteristic(ULTRANOS_P2P_CHAR_UUID)
    return new BleConnection(bleDevice, characteristic)
  }

  /**
   * PWA cannot advertise as BLE peripheral — this is a no-op stub.
   * For OPD-Lite receiver side: requires native app wrapper with BLE peripheral support.
   */
  async advertise(_serviceInfo: ServiceInfo): Promise<void> {
    console.warn('[BleTransport] BLE peripheral advertising is not supported in PWA context. Use LocalNetworkTransport.')
  }

  onIncomingConnection(handler: (conn: P2PConnection) => void): void {
    this.incomingHandlers.push(handler)
  }
}
