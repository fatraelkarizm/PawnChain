import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      assetName?: string;
      principalSol?: number;
      interestPercent?: number;
      tenorDays?: number;
      language?: "id" | "en";
    };

    const assetName = body.assetName || "Aset Gadai";
    const principalSol = body.principalSol ?? 1.5;
    const interestPercent = body.interestPercent ?? 5;
    const tenorDays = body.tenorDays ?? 14;
    const totalRepay = (principalSol * (1 + interestPercent / 100)).toFixed(3);
    const lang = body.language === "en" ? "en" : "id";

    const script =
      lang === "en"
        ? `PawnChain contract summary. You are pledging ${assetName} for a loan of ${principalSol} SOL. Flat interest is ${interestPercent} percent over ${tenorDays} days. Total repayment at maturity is ${totalRepay} SOL. If unpaid after the due date, the lender can claim the collateral.`
        : `Ringkasan kontrak PawnChain. Anda menggadaikan ${assetName} untuk pinjaman sebesar ${principalSol} SOL dengan bunga tetap ${interestPercent} persen selama ${tenorDays} hari. Total pelunasan saat jatuh tempo adalah ${totalRepay} SOL. Jika melewati batas waktu, pemberi pinjaman dapat mengklaim jaminan.`;

    const apiKey = process.env.ELEVENLABS_API_KEY;
    const voiceId = process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";

    if (apiKey) {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: script,
          model_id: "eleven_multilingual_v2",
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (res.ok) {
        const buffer = Buffer.from(await res.arrayBuffer());
        return NextResponse.json({
          provider: "elevenlabs",
          script,
          audioDataUrl: `data:audio/mpeg;base64,${buffer.toString("base64")}`,
        });
      }
    }

    return NextResponse.json({
      provider: "browser_speech_fallback",
      script,
      audioDataUrl: null,
    });
  } catch {
    return NextResponse.json({ error: "Voice briefing error" }, { status: 500 });
  }
}
