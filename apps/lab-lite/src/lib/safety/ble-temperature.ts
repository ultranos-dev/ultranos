/**
 * Web Bluetooth API integration for BLE temperature sensors.
 *
 * Targets $15 IoT temperature loggers exposing the standard
 * Health Thermometer GATT service (UUID 0x1809).
 *
 * Constraints:
 * - Requires HTTPS (Lab-Lite is served as a PWA over HTTPS).
 * - Initial requestDevice() must be triggered by a user gesture (button tap).
 * - Browser support: Chrome, Edge, Opera. NOT Firefox/Safari.
 */

const HEALTH_THERMOMETER_SERVICE = 'health_thermometer' // UUID 0x1809
const TEMPERATURE_MEASUREMENT_CHARACTERISTIC = 'temperature_measurement' // UUID 0x2A1C

export interface BleSensor {
  id: string
  name: string | null
  device: BluetoothDevice
}

export interface BleConnection {
  sensor: BleSensor
  server: BluetoothRemoteGATTServer
  service: BluetoothRemoteGATTService
  characteristic: BluetoothRemoteGATTCharacteristic
}

/** Check if the Web Bluetooth API is available in the current browser. */
export function isBleAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator
}

/**
 * Scan for nearby BLE temperature loggers.
 * Must be called from a user gesture handler (button click).
 */
export async function scanForSensors(): Promise<BleSensor[]> {
  if (!isBleAvailable()) return []

  try {
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [HEALTH_THERMOMETER_SERVICE] }],
      optionalServices: ['battery_service'],
    })

    return [
      {
        id: device.id,
        name: device.name ?? null,
        device,
      },
    ]
  } catch {
    // User cancelled the dialog or no device found
    return []
  }
}

/**
 * Connect to a specific BLE temperature sensor.
 * Establishes GATT connection and resolves the temperature measurement characteristic.
 */
export async function connectSensor(sensor: BleSensor): Promise<BleConnection> {
  const server = await sensor.device.gatt!.connect()
  const service = await server.getPrimaryService(HEALTH_THERMOMETER_SERVICE)
  const characteristic = await service.getCharacteristic(
    TEMPERATURE_MEASUREMENT_CHARACTERISTIC,
  )

  return { sensor, server, service, characteristic }
}

/**
 * Read the current temperature value from a connected sensor.
 * Parses the IEEE 11073 Temperature Measurement format.
 */
export async function readTemperature(
  connection: BleConnection,
): Promise<number> {
  const value = await connection.characteristic.readValue()
  return parseTemperatureMeasurement(value)
}

/**
 * Subscribe to temperature notifications for continuous monitoring.
 * Calls the callback whenever a new temperature reading is received.
 */
export async function subscribeToTemperature(
  connection: BleConnection,
  callback: (temp: number) => void,
): Promise<void> {
  connection.characteristic.addEventListener(
    'characteristicvaluechanged',
    (event: Event) => {
      const target = event.target as BluetoothRemoteGATTCharacteristic
      if (target.value) {
        callback(parseTemperatureMeasurement(target.value))
      }
    },
  )
  await connection.characteristic.startNotifications()
}

/** Disconnect from a BLE sensor. */
export function disconnectSensor(connection: BleConnection): void {
  try {
    connection.server.disconnect()
  } catch {
    // Already disconnected
  }
}

/**
 * Parse the IEEE 11073 Temperature Measurement characteristic value.
 * Byte 0: flags (bit 0 = Fahrenheit if set, Celsius if clear)
 * Bytes 1-4: IEEE-11073 32-bit FLOAT (mantissa + exponent)
 */
function parseTemperatureMeasurement(value: DataView): number {
  const flags = value.getUint8(0)
  const isFahrenheit = (flags & 0x01) !== 0

  // IEEE 11073 FLOAT: mantissa (24-bit signed) and exponent (8-bit signed)
  const byte1 = value.getUint8(1)
  const byte2 = value.getUint8(2)
  const byte3 = value.getUint8(3)
  const byte4 = value.getUint8(4)

  const exponent = byte4 >= 128 ? byte4 - 256 : byte4 // signed int8
  let mantissa = byte1 | (byte2 << 8) | (byte3 << 16)
  if (mantissa >= 0x800000) mantissa -= 0x1000000 // signed int24

  let tempValue = mantissa * Math.pow(10, exponent)

  // Convert Fahrenheit to Celsius if needed
  if (isFahrenheit) {
    tempValue = (tempValue - 32) * (5 / 9)
  }

  return Math.round(tempValue * 100) / 100 // 2 decimal places
}
