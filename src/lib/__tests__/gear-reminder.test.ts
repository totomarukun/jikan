import { describe, expect, it } from "vitest";
import { gearReminder } from "../gear-reminder";

const now = new Date("2026-06-13T00:00:00Z");
const daysAgo = (d: number) =>
  new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

describe("gearReminder", () => {
  it("貼付日が無ければ null", () => {
    expect(gearReminder(null, now)).toBeNull();
    expect(gearReminder(undefined, now)).toBeNull();
  });

  it("貼りたて (14日未満) は due でない", () => {
    const r = gearReminder(daysAgo(5), now)!;
    expect(r.elapsedLabel).toBe("貼りたて");
    expect(r.due).toBe(false);
  });

  it("約3ヶ月では経過を示すが due でない", () => {
    const r = gearReminder(daysAgo(90), now)!;
    expect(r.elapsedLabel).toBe("貼って約3ヶ月");
    expect(r.due).toBe(false);
  });

  it("約4ヶ月(120日)以上で due になりメッセージが付く", () => {
    const r = gearReminder(daysAgo(125), now)!;
    expect(r.due).toBe(true);
    expect(r.message).toContain("張り替え");
  });

  it("不正な日付は null", () => {
    expect(gearReminder("not-a-date", now)).toBeNull();
  });
});
