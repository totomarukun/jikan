// 張り替え時期リマインド: 現用ラバーの「貼った日」からの経過で、そろそろ交換かを示す。
// 卓球ラバーの寿命目安は使用頻度で変わるが、一般に3〜6ヶ月/約80時間と語られる
// (出所はリサーチ参照)。使用時間を持たないので、経過月数でやわらかく示す。
// 断定しない (ブランド指針: 「絶対」等の強い表現は使わない)。

const SOFT_DUE_DAYS = 120; // 約4ヶ月でやわらかく交換検討を促す
const MS_PER_DAY = 1000 * 60 * 60 * 24;

export interface GearReminder {
  /** 経過日数 */
  days: number;
  /** 経過の表示ラベル (例: "貼って約3ヶ月") */
  elapsedLabel: string;
  /** やわらかい交換検討の閾値を超えたか */
  due: boolean;
  /** due のときの一言 */
  message?: string;
}

export function gearReminder(
  usageStartedAt: Date | string | null | undefined,
  now: Date = new Date(),
): GearReminder | null {
  if (!usageStartedAt) return null;
  const start = new Date(usageStartedAt);
  if (Number.isNaN(start.getTime())) return null;
  const days = Math.max(0, Math.floor((now.getTime() - start.getTime()) / MS_PER_DAY));

  const months = Math.floor(days / 30);
  const elapsedLabel =
    days < 14
      ? "貼りたて"
      : months < 1
        ? `貼って約${Math.floor(days / 7)}週間`
        : `貼って約${months}ヶ月`;

  const due = days >= SOFT_DUE_DAYS;
  return {
    days,
    elapsedLabel,
    due,
    message: due
      ? "そろそろ張り替えを検討する頃かも。劣化サイン: 表面のツヤ・ひっかかりの低下"
      : undefined,
  };
}
