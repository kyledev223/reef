import { Fredoka, Nunito } from "next/font/google";

export const display = Fredoka({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-display" });
export const body = Nunito({ subsets: ["latin"], weight: ["400", "600", "700", "800"], variable: "--font-body" });
