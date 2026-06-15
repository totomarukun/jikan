import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Tailwind クラスの結合 (shadcn/ui 標準): 条件付きクラス + 重複ユーティリティの解決。
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
