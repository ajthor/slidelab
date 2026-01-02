import crypto from "node:crypto"

export const hashPath = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex").slice(0, 16)
