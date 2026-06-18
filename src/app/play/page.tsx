import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionId } from "@/lib/session";
import { buildQuestionPayload } from "@/lib/play";
import { PlayClient } from "@/components/play-client";

export const metadata = { title: "比較に答える" };

// M3: AB比較カード (コア体験)。初回の1問はサーバーで生成して即表示する。
export default async function PlayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sessionId = await getSessionId();
  if (!sessionId) redirect("/onboarding");

  const payload = await buildQuestionPayload(sessionId);
  if (!payload) redirect("/onboarding");

  // ギア未登録のまま来た人に、いきなり「現用と無関係なイメージ質問」を
  // 出すと、両方使った人の比較を期待した第一印象を損ねる。まず登録を促す。
  // (?explore=1 でイメージ回答を試したい人は明示的に進める)
  const sp = await searchParams;
  if (payload.progress.gearCount === 0 && sp.explore !== "1") {
    return <GearGate />;
  }

  return <PlayClient initial={payload} />;
}

function GearGate() {
  return (
    <div className="mx-auto max-w-md py-10">
      <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-black/5">
        <h1 className="text-xl font-bold">まず、使ったラバーを登録</h1>
        <p className="mt-3 text-sm leading-7 text-tt-gray70">
          ガチスペは、<strong className="text-tt-charcoal">あなたが実際に使った</strong>
          ラバーだけを比べてもらいます。
          <strong className="text-tt-charcoal">同じ面で2本以上</strong>
          登録すると、あなただけの比較が始まります。
        </p>
        <Link
          href="/gear"
          className="mt-6 inline-block w-full rounded-xl bg-tt-green py-3.5 font-bold text-white shadow-lg shadow-tt-green/20 transition hover:opacity-90 active:scale-95"
        >
          ラバーを登録する
        </Link>
        <Link
          href="/play?explore=1"
          className="mt-3 block text-xs text-tt-gray70 underline"
        >
          まずは予想で答えて試す（参考データになります）
        </Link>
      </div>
    </div>
  );
}
