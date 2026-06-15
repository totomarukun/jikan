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

// 回答からの傾向がまだ弱いとき、攻撃志向などと断言せず中立に。
// 申告したプレイスタイル(カット主戦型など)があればそれを尊重したラベルにする
// (守備型を「攻撃志向」と言い切ってカット型ユーザーの信頼を失わないため)。
function neutralStyleLabel(playstyle?: string): string {
  switch (playstyle) {
    case "CUT":
      return "守備（カット）型";
    case "DRIVE":
      return "ドライブ型";
    case "QUICK_ATTACK":
      return "前陣速攻型";
    default:
      return "バランス型";
  }
}

export function diagnose(
  answers: DiagnosisInput[],
  playstyle?: string,
): DiagnosisResult {
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

  // 強い傾向が出た軸だけをラベルにする。弱い軸を埋め草で断言しない
  // (とくに control は signal が無いと従来「攻撃志向」に倒れ、カット型を
  //  攻撃志向と言い切る不具合があった)。
  const parts: string[] = [];
  if (spinVsSpeed > 0.4) parts.push("スピン重視");
  else if (spinVsSpeed < -0.4) parts.push("スピード重視");
  if (controlVsPower > 0.3) parts.push("コントロール志向");
  else if (controlVsPower < -0.3) parts.push("攻撃志向");

  const styleName =
    parts.length > 0 ? `${parts.join("・")}型` : neutralStyleLabel(playstyle);

  return {
    styleName,
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
