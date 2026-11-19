// Mirrors @zk-email/sdk@2.0.11's relayerUtils.parsePublicSignals/processIntegers
// so the server can decode values from the signals it cryptographically verifies.
/** @param {string[]} publicSignals @param {Array<{name: string, maxLength: number, isHashed?: boolean, parts: Array<{isPublic: boolean}>}>} decomposedRegexes @returns {Record<string, string[]>} */
export function decodePublicSignals(publicSignals, decomposedRegexes) {
  if (!Array.isArray(publicSignals) || !publicSignals.every(value => typeof value === "string" && /^\d+$/.test(value))) {
    throw new TypeError("Public signals must be an array of decimal field strings.");
  }
  let cursor = 3; // SDK's Circom verifier has three reserved leading signals.
  const decoded = {};
  for (const regex of decomposedRegexes) {
    const partOutputs = [];
    const signalLength = regex.isHashed ? 1 : Math.ceil(regex.maxLength / 31);
    for (const part of regex.parts) {
      if (!part.isPublic) continue;
      const slice = publicSignals.slice(cursor, cursor + signalLength);
      if (slice.length !== signalLength) throw new Error(`Incomplete public signals for ${regex.name}.`);
      cursor += signalLength;
      partOutputs.push(regex.isHashed ? slice.join("") : decodeIntegerChunks(slice));
    }
    decoded[regex.name] = partOutputs;
  }
  if (cursor !== publicSignals.length) throw new Error("Unexpected extra public signals.");
  return decoded;
}

// Mirrors @zk-email/sdk@2.0.11's private Noir UiA output layout. Unlike
// Circom, Noir emits four reserved values and public strings as one hex byte
// per character followed by a length field.
/** @param {string[]} publicSignals @param {Array<{name: string, maxLength: number, isHashed?: boolean, parts: Array<{isPublic: boolean}>}>} decomposedRegexes @returns {Record<string, string[]>} */
export function decodeNoirPublicSignals(publicSignals, decomposedRegexes) {
  if (!Array.isArray(publicSignals) || !publicSignals.every(value => typeof value === "string" && /^0x[0-9a-fA-F]+$/.test(value))) {
    throw new TypeError("Noir public outputs must be hexadecimal field strings.");
  }
  let cursor = 4; // SDK Noir decoder's four reserved leading outputs.
  const decoded = {};
  for (const regex of decomposedRegexes) {
    const values = [];
    for (const part of regex.parts) {
      if (!part.isPublic) continue;
      if (regex.isHashed) {
        if (cursor >= publicSignals.length) throw new Error(`Incomplete public signals for ${regex.name}.`);
        values.push(publicSignals[cursor++]);
        continue;
      }
      const end = cursor + regex.maxLength;
      if (end >= publicSignals.length) throw new Error(`Incomplete public signals for ${regex.name}.`);
      let value = "";
      for (; cursor < end; cursor++) {
        let hex = publicSignals[cursor].slice(2).replace(/^0+/, "");
        if (!hex) continue;
        if (hex.length % 2) hex = `0${hex}`;
        const bytes = new Uint8Array(hex.length / 2);
        for (let index = 0; index < hex.length; index += 2) bytes[index / 2] = Number.parseInt(hex.slice(index, index + 2), 16);
        value += new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      }
      const length = Number.parseInt(publicSignals[cursor++], 16);
      if (!Number.isSafeInteger(length) || value.length !== length) throw new Error(`Noir output length mismatch for ${regex.name}.`);
      values.push(value);
    }
    decoded[regex.name] = values;
  }
  if (cursor !== publicSignals.length) throw new Error("Unexpected extra Noir public signals.");
  return decoded;
}

/** @param {string[]} integers @returns {string} */
function decodeIntegerChunks(integers) {
  let result = "";
  for (const value of integers) {
    const number = BigInt(value);
    if (number === 0n) continue;
    let hex = number.toString(16);
    if (hex.length % 2) hex = `0${hex}`;
    const bytes = [];
    for (let index = 0; index < hex.length; index += 2) bytes.push(Number.parseInt(hex.slice(index, index + 2), 16));
    bytes.reverse();
    result += new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
  }
  return result;
}
