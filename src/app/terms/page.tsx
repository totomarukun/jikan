export const metadata = { title: "利用規約" };

export default function TermsPage() {
  return (
    <article className="prose mx-auto max-w-md py-4 text-sm leading-7">
      <h1 className="mb-4 text-xl font-bold">利用規約</h1>
      <p className="text-tt-gray70">最終更新日: 2026年6月11日</p>
      <section className="mt-4 space-y-4">
        <div>
          <h2 className="font-bold">1. サービス概要</h2>
          <p>
            TacTap（以下「本サービス」）は、卓球用具のAB比較データを収集・集計し、
            用具選びの参考情報を提供するサービスです。
          </p>
        </div>
        <div>
          <h2 className="font-bold">2. データの取り扱い</h2>
          <p>
            回答データは匿名化された統計情報として集計・公開されます。
            メールアドレスはログインおよび重要なお知らせの送信にのみ使用します。
          </p>
        </div>
        <div>
          <h2 className="font-bold">3. 免責事項</h2>
          <p>
            本サービスが提供する集計データはユーザーの主観的な回答に基づくものであり、
            用具の性能を保証するものではありません。購入の最終判断はご自身でお願いします。
          </p>
        </div>
        <div>
          <h2 className="font-bold">4. 禁止事項</h2>
          <p>
            集計データを意図的に歪める行為（組織的な大量回答等）、
            本サービスのデータの無断商用利用を禁止します。
          </p>
        </div>
        <div>
          <h2 className="font-bold">5. 規約の変更</h2>
          <p>本規約は必要に応じて改定されることがあります。</p>
        </div>
      </section>
    </article>
  );
}
