import { SerialPort } from "serialport";
import { EventEmitter } from "events";

// OBD Parser interface (simplified)
interface OBDParser {
  parse(data: string): any;
}

/**
 * OBD Hardware Manager
 * Handles communication with ELM327 and D-CAN adapters via serial port
 */

export interface OBDDevice {
  port: string;
  baudRate: number;
  type: "elm327" | "dcan";
  isConnected: boolean;
  lastUpdate: Date;
}

export interface OBDParameter {
  pid: string;
  name: string;
  value: number | string;
  unit: string;
  timestamp: Date;
}

export interface OBDError {
  code: string;
  description: string;
  severity: "info" | "warning" | "error" | "critical";
}

export class OBDManager extends EventEmitter {
  private devices: Map<string, SerialPort> = new Map();
  private obdParsers: Map<string, OBDParser | null> = new Map();
  private connectionStates: Map<string, OBDDevice> = new Map();
  private scanIntervals: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Initialize OBD device connection
   */
  async connectDevice(
    port: string,
    type: "elm327" | "dcan" = "elm327",
    baudRate: number = 9600
  ): Promise<boolean> {
    try {
      // Create serial port connection
      const serialPort = new SerialPort({
        path: port,
        baudRate: baudRate,
        autoOpen: false,
      });

      // Handle port open
      serialPort.on("open", () => {
        console.log(`[OBD] Connected to ${port}`);
        this.connectionStates.set(port, {
          port,
          baudRate,
          type,
          isConnected: true,
          lastUpdate: new Date(),
        });

        // Initialize OBD parser
        this.obdParsers.set(port, null); // Parser will be initialized on first data

        // Send initialization commands
        this.initializeDevice(port, type);

        this.emit("connected", { port, type });
      });

      // Handle data reception
      serialPort.on("data", (data) => {
        this.handleData(port, data.toString());
      });

      // Handle errors
      serialPort.on("error", (error) => {
        console.error(`[OBD] Error on ${port}:`, error);
        this.emit("error", { port, error: error.message });
      });

      // Handle port close
      serialPort.on("close", () => {
        console.log(`[OBD] Disconnected from ${port}`);
        const state = this.connectionStates.get(port);
        if (state) {
          state.isConnected = false;
        }
        this.emit("disconnected", { port });
      });

      // Store device reference
      this.devices.set(port, serialPort);

      // Open the port
      await new Promise<void>((resolve, reject) => {
        serialPort.open((error) => {
          if (error) reject(error);
          else resolve();
        });
      });

      return true;
    } catch (error) {
      console.error(`[OBD] Failed to connect to ${port}:`, error);
      this.emit("error", { port, error: String(error) });
      return false;
    }
  }

  /**
   * Initialize OBD device with setup commands
   */
  private initializeDevice(port: string, type: "elm327" | "dcan"): void {
    const serialPort = this.devices.get(port);
    if (!serialPort) return;

    if (type === "elm327") {
      // ELM327 initialization sequence
      const commands = [
        "AT Z\r",        // Reset device
        "AT E0\r",       // Echo off
        "AT S0\r",       // Spaces off
        "AT L0\r",       // Linefeeds off
        "AT SP 0\r",     // Auto protocol detection
        "AT RA\r",       // Receive address off
        "AT H1\r",       // Headers on
        "AT D1\r",       // Display DLC on
      ];

      commands.forEach((cmd, index) => {
        setTimeout(() => {
          serialPort.write(cmd);
        }, 100 * (index + 1));
      });
    } else if (type === "dcan") {
      // D-CAN initialization
      const commands = [
        "AT Z\r",
        "AT E0\r",
        "AT SP 6\r",     // Set to CAN 500kbps
      ];

      commands.forEach((cmd, index) => {
        setTimeout(() => {
          serialPort.write(cmd);
        }, 100 * (index + 1));
      });
    }
  }

  /**
   * Handle incoming data from OBD device
   */
  private handleData(port: string, data: string): void {
    try {
      // Parse OBD response
      const response = data.trim();

      // Emit raw data event
      this.emit("data", { port, raw: response });

      // Update last update timestamp
      const state = this.connectionStates.get(port);
      if (state) {
        state.lastUpdate = new Date();
      }
    } catch (error) {
      console.error(`[OBD] Error parsing data from ${port}:`, error);
    }
  }

  /**
   * Request OBD parameter
   */
  async requestParameter(
    port: string,
    pid: string,
    name: string,
    unit: string
  ): Promise<OBDParameter | null> {
    const serialPort = this.devices.get(port);
    if (!serialPort || !serialPort.isOpen) {
      console.warn(`[OBD] Port ${port} is not open`);
      return null;
    }

    try {
      // Send OBD request command
      const command = `01${pid}\r`;
      serialPort.write(command);

      // Wait for response (simplified - in production use proper async handling)
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          resolve(null);
        }, 1000);

        const responseHandler = (data: any) => {
          clearTimeout(timeout);
          this.removeListener("data", responseHandler);

          // Parse response (simplified)
          const value = Math.random() * 100; // Mock value for demo
          resolve({
            pid,
            name,
            value,
            unit,
            timestamp: new Date(),
          });
        };

        this.once("data", responseHandler);
      });
    } catch (error) {
      console.error(`[OBD] Error requesting parameter ${pid}:`, error);
      return null;
    }
  }

  /**
   * Start continuous scanning
   */
  startScanning(port: string, interval: number = 1000): void {
    if (this.scanIntervals.has(port)) {
      console.warn(`[OBD] Scanning already active on ${port}`);
      return;
    }

    const scanInterval = setInterval(async () => {
      const state = this.connectionStates.get(port);
      if (!state || !state.isConnected) {
        clearInterval(scanInterval);
        this.scanIntervals.delete(port);
        return;
      }

      // Request common OBD parameters
      const parameters = [
        { pid: "0C", name: "Engine RPM", unit: "rpm" },
        { pid: "0D", name: "Vehicle Speed", unit: "km/h" },
        { pid: "05", name: "Engine Coolant Temperature", unit: "°C" },
        { pid: "0A", name: "Fuel Pressure", unit: "psi" },
        { pid: "14", name: "O2 Sensor (Bank 1, Sensor 1)", unit: "V" },
      ];

      for (const param of parameters) {
        const result = await this.requestParameter(
          port,
          param.pid,
          param.name,
          param.unit
        );
        if (result) {
          this.emit("parameter", result);
        }
      }
    }, interval);

    this.scanIntervals.set(port, scanInterval);
    console.log(`[OBD] Started scanning on ${port} (interval: ${interval}ms)`);
  }

  /**
   * Stop continuous scanning
   */
  stopScanning(port: string): void {
    const interval = this.scanIntervals.get(port);
    if (interval) {
      clearInterval(interval);
      this.scanIntervals.delete(port);
      console.log(`[OBD] Stopped scanning on ${port}`);
    }
  }

  /**
   * Disconnect device
   */
  async disconnectDevice(port: string): Promise<void> {
    // Stop scanning first
    this.stopScanning(port);

    const serialPort = this.devices.get(port);
    if (serialPort && serialPort.isOpen) {
      await new Promise<void>((resolve) => {
        serialPort.close(() => resolve());
      });
    }

    this.devices.delete(port);
    this.obdParsers.delete(port);
    this.connectionStates.delete(port);
  }

  /**
   * Get list of available serial ports
   */
  async getAvailablePorts(): Promise<string[]> {
    try {
      const ports = await SerialPort.list();
      return ports.map((port) => port.path);
    } catch (error) {
      console.error("[OBD] Error listing ports:", error);
      return [];
    }
  }

  /**
   * Get connection status
   */
  getConnectionStatus(port: string): OBDDevice | null {
    return this.connectionStates.get(port) || null;
  }

  /**
   * Get all active connections
   */
  getAllConnections(): OBDDevice[] {
    return Array.from(this.connectionStates.values());
  }

  /**
   * Read error codes (DTCs)
   */
  async readErrorCodes(port: string): Promise<OBDError[]> {
    const serialPort = this.devices.get(port);
    if (!serialPort || !serialPort.isOpen) {
      return [];
    }

    try {
      // Request error codes
      serialPort.write("03\r"); // Read DTC command

      // In production, properly parse the response
      // For now, return mock data
      return [
        {
          code: "P0101",
          description: "Mass or Volume Air Flow Circuit Range/Performance",
          severity: "warning",
        },
        {
          code: "P0300",
          description: "Random/Multiple Cylinder Misfire Detected",
          severity: "error",
        },
      ];
    } catch (error) {
      console.error(`[OBD] Error reading error codes:`, error);
      return [];
    }
  }

  /**
   * Clear error codes
   */
  async clearErrorCodes(port: string): Promise<boolean> {
    const serialPort = this.devices.get(port);
    if (!serialPort || !serialPort.isOpen) {
      return false;
    }

    try {
      serialPort.write("04\r"); // Clear DTC command
      return true;
    } catch (error) {
      console.error(`[OBD] Error clearing error codes:`, error);
      return false;
    }
  }
}

// Export singleton instance
export const obdManager = new OBDManager();
