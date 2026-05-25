import { NextRequest } from "next/server";
import QRCode from "qrcode";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");

  if (!url) {
    return Response.json({ error: "Missing url" }, { status: 400 });
  }

  try {
    const pngBuffer = await QRCode.toBuffer(url, {
      type: "png",
      width: 200,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    });

    return new Response(new Uint8Array(pngBuffer), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-cache",
      },
    });
  } catch {
    return Response.json({ error: "QR generation failed" }, { status: 500 });
  }
}
