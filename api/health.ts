import type { VercelRequest, VercelResponse } from "./vercelTypes";

export default function handler(_request: VercelRequest, response: VercelResponse) {
  response.status(200).json({ ok: true });
}
