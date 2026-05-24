const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";
export const apiUrl = (path: string) => `${BASE}${path}`;
