// スタイル推定ロジック (企画書 7.3 M5 の MVP簡略版)
//
// - スピン vs スピードの選好カウントから「スピン重視/スピード重視/バランス型」
// - 硬さの選好から「硬め/柔らかめ/中立」
// - コントロール重視度から「コントロール志向/攻撃志向」
//
// 軸指定の回答はその軸へ直接カウントし、総合好みの回答は
// 選ばれた用具の公称スペック差から選好を推定する。

export interface DiagnosisInput {
  axis: string; // overall | speed | spin | control
  winner: string; // A | B | SAME | UNKNOWN
  optionA: SpecLite;
  optionB: SpecLite;
}

export interface SpecLite {
  officialSpeed: number | null;
  officialSpin: number | null;
  hardness: number | null;
}

export interface DiagnosisResult {
  styleName: string;
  spinVsSpeed: number; // 正: スピン重視
  hardness: number; // 正: 硬め
  controlVsPower: number; // 正: コントロール重視
  answeredCount: number;
}

function diffScore(winner: SpecLite, loser: SpecLite, key: keyof SpecLite): number {
  const w = winner[key];
  const l = loser[key];
  if (w == null || l == null || w === l) return 0;
  return w > l ? 1 : -1;
}

export function diagnose(answers: DiagnosisInput[]): DiagnosisResult {
  let spin = 0;
  let speed = 0;
  let hard = 0;
  let control = 0;
  let counted = 0;

  for (const ans of answers) {
    if (ans.winner !== "A" && ans.winner !== "B") continue;
    const winner = ans.winner === "A" ? ans.optionA : ans.optionB;
    const loser = ans.winner === "A" ? ans.optionB : ans.optionA;
    counted++;

    if (ans.axis === "speed") {
      // 「速いのはどちら？」等の軸指定回答は知覚の表明であり選好ではないため除外
      continue;
    }
    if (ans.axis === "spin") continue;
    if (ans.axis === "hardness") continue;
    if (ans.axis === "ballHold") continue;
    if (ans.axis === "control") {
      control += 1;
      continue;
    }

    // overall: 選んだ用具のスペック傾向 = 選好とみなす
    spin += diffScore(winner, loser, "officialSpin");
    speed += diffScore(winner, loser, "officialSpeed");
    hard += diffScore(winner, loser, "hardness");
    // 低スピード側を選ぶ傾向はコントロール志向の代理指標
    control += -diffScore(winner, loser, "officialSpeed") * 0.5;
  }

  const n = Math.max(counted, 1);
  const norm = (v: number) => Math.round((v / Math.sqrt(n)) * 10) / 10;

  const spinVsSpeed = norm(spin - speed);
  const hardness = norm(hard);
  const controlVsPower = norm(control);

  const spinLabel =
    spinVsSpeed > 0.4 ? "スピン重視" : spinVsSpeed < -0.4 ? "スピード重視" : "バランス";
  const controlLabel = controlVsPower > 0.3 ? "コントロール志向" : "攻撃志向";

  return {
    styleName: `${spinLabel}・${controlLabel}型`,
    spinVsSpeed,
    hardness,
    controlVsPower,
    answeredCount: answers.length,
  };
}

export function tendencyRows(result: DiagnosisResult): Array<{
  label: string;
  value: number;
}> {
  return [
    {
      label: result.spinVsSpeed >= 0 ? "スピン > スピード" : "スピード > スピン",
      value: Math.abs(result.spinVsSpeed),
    },
    {
      label: result.hardness >= 0 ? "硬めの打感" : "柔らかめの打感",
      value: Math.abs(result.hardness),
    },
    {
      label: result.controlVsPower >= 0 ? "コントロール重視" : "攻撃重視",
      value: Math.abs(result.controlVsPower),
    },
  ];
}
