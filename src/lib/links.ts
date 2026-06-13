// 購入導線 (アフィリエイト導入前の検索リンク)。
// 中立性ガイドライン: 特定ECやメーカーを「推奨」しない。検索結果へ送るのみ。

export function amazonSearchUrl(manufacturer: string, name: string): string {
  return `https://www.amazon.co.jp/s?k=${encodeURIComponent(`${manufacturer} ${name} 卓球`)}`;
}

export function rakutenSearchUrl(manufacturer: string, name: string): string {
  return `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(`${manufacturer} ${name} 卓球`)}/`;
}

// レビュー動画導線: 試打レビューは用具選びで実際に参照される情報源。
// 中立性のため特定チャンネルを推さず、検索結果へ送る。
export function youtubeSearchUrl(manufacturer: string, name: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} ${manufacturer} 卓球 レビュー`)}`;
}
