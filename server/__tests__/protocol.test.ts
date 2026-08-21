import { describe, expect, it } from "vitest";
import {
  decodeDtcBytes,
  decodeMode01Response,
  decodeMode03Response,
  extractHexBytes,
  getPidDefinition,
  isNormalReading,
  ObdProtocolError,
  severityForCode,
} from "../obd/protocol";

describe("extractHexBytes", () => {
  it("reads spaced and packed hex alike", () => {
    expect(extractHexBytes("41 0C 1A F8")).toEqual([0x41, 0x0c, 0x1a, 0xf8]);
    expect(extractHexBytes("410C1AF8")).toEqual([0x41, 0x0c, 0x1a, 0xf8]);
  });

  it("drops the prompt, echoed command and SEARCHING notice", () => {
    expect(extractHexBytes("SEARCHING...\r41 0D 32\r\r>")).toEqual([
      0x41, 0x0d, 0x32,
    ]);
  });

  it("ignores tokens that are not whole bytes", () => {
    expect(extractHexBytes("41 0D 3")).toEqual([0x41, 0x0d]);
  });
});

describe("decodeMode01Response", () => {
  // Values checked against the SAE J1979 formulas.
  it.each([
    ["0C", "41 0C 1A F8", 1726], // (0x1AF8) / 4
    ["0D", "41 0D 32", 50], // A
    ["05", "41 05 7B", 83], // A - 40
    ["0A", "41 0A 64", 300], // A * 3
    ["11", "41 11 FF", 100], // A * 100 / 255
    ["14", "41 14 80 FF", 0.64], // A / 200
    ["42", "41 42 39 D0", 14.8], // (256A+B) / 1000
  ])("decodes PID %s", (pid, response, expected) => {
    expect(decodeMode01Response(pid, response)).toBe(expected);
  });

  it("finds the payload behind a CAN header", () => {
    expect(decodeMode01Response("0D", "7E8 03 41 0D 32")).toBe(50);
  });

  it("returns null when the ECU answers about a different PID", () => {
    expect(decodeMode01Response("0C", "41 0D 32")).toBeNull();
  });

  it("throws on adapter errors rather than reporting a value", () => {
    expect(() => decodeMode01Response("0C", "UNABLE TO CONNECT")).toThrow(
      ObdProtocolError
    );
    expect(() => decodeMode01Response("0C", "NO DATA")).toThrow(
      ObdProtocolError
    );
  });

  it("throws on a truncated payload instead of decoding garbage", () => {
    // PID 0C needs two data bytes.
    expect(() => decodeMode01Response("0C", "41 0C 1A")).toThrow(/Truncated/);
  });

  it("rejects unknown PIDs", () => {
    expect(() => decodeMode01Response("ZZ", "41 ZZ 00")).toThrow(
      ObdProtocolError
    );
  });
});

describe("decodeDtcBytes", () => {
  it.each([
    [0x01, 0x43, "P0143"],
    [0x41, 0x71, "C0171"],
    [0x81, 0x22, "B0122"],
    [0xc1, 0x00, "U0100"],
    [0x03, 0x00, "P0300"],
  ])("decodes %s %s to %s", (a, b, expected) => {
    expect(decodeDtcBytes(a, b)?.code).toBe(expected);
  });

  it("treats an all-zero pair as an unused slot", () => {
    expect(decodeDtcBytes(0, 0)).toBeNull();
  });
});

describe("decodeMode03Response", () => {
  it("reads a CAN response with a count byte", () => {
    expect(
      decodeMode03Response("43 02 01 43 41 71").map(dtc => dtc.code)
    ).toEqual(["P0143", "C0171"]);
  });

  it("ignores CAN frame padding", () => {
    expect(
      decodeMode03Response("43 01 01 43 00 00 00 00").map(dtc => dtc.code)
    ).toEqual(["P0143"]);
  });

  it("honours an explicit countByte override", () => {
    // The same bytes parse both ways; the caller decides which protocol applies.
    expect(
      decodeMode03Response("43 01 43 41 71", { countByte: "absent" }).map(
        d => d.code
      )
    ).toEqual(["P0143", "C0171"]);
    expect(
      decodeMode03Response("43 01 43 00 00", { countByte: "present" }).map(
        d => d.code
      )
    ).toEqual(["C0300"]);
  });

  it("reports no stored codes as an empty list, not an error", () => {
    expect(decodeMode03Response("NO DATA")).toEqual([]);
    expect(decodeMode03Response("43 00")).toEqual([]);
  });

  it("throws on a real adapter failure", () => {
    expect(() => decodeMode03Response("BUS ERROR")).toThrow(ObdProtocolError);
  });

  it("de-duplicates codes repeated across frames", () => {
    expect(
      decodeMode03Response("43 02 01 43 01 43").map(dtc => dtc.code)
    ).toEqual(["P0143"]);
  });

  it("assigns the system from the code letter", () => {
    expect(decodeMode03Response("43 01 41 71")[0].system).toBe("Chassis");
  });
});

describe("isNormalReading", () => {
  it("flags readings outside the healthy band", () => {
    const coolant = getPidDefinition("05")!;
    expect(isNormalReading(coolant, 90)).toBe(true);
    expect(isNormalReading(coolant, 130)).toBe(false);
  });
});

describe("severityForCode", () => {
  it("rates misfires as critical", () => {
    expect(severityForCode("P0300")).toBe("critical");
    expect(severityForCode("P0302")).toBe("critical");
  });

  it("rates network faults as errors", () => {
    expect(severityForCode("U0100")).toBe("error");
  });

  it("defaults unknown powertrain codes to warning", () => {
    expect(severityForCode("P0abc".toUpperCase())).toBe("warning");
  });
});
