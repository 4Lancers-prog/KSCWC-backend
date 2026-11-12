// bigint-json.ts — make BigInt JSON-serializable. All money is integer paise, comfortably within
// Number.MAX_SAFE_INTEGER (2^53), so serializing BigInt as a JS number is safe and gives the client
// plain numbers (matching the frontend DTO types). Imported once, first, from app.ts.
(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function toJSON(this: bigint) {
  return Number(this);
};

export {};
