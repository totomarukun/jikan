// 購入導線 (アフィリエイト導入前の検索リンク)。
// 中立性ガイドライン: 特定ECやメーカーを「推奨」しない。検索結果へ送るのみ。

export function amazonSearchUrl(manufacturer: string, name: string): string {
  return `https://www.amazon.co.jp/s?k=${encodeURIComponent(`${manufacturer} ${name} 卓球`)}`;
}

export function rakutenSearchUrl(manufacturer: string, name: string): string {
  return `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(`${manufacturer} ${name} 卓球`)}/`;
}
