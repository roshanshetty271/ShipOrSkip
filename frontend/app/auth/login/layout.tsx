import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Sign in — ShipOrSkip",
    description: "Sign in to save your research and unlock deep analysis.",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
    return children;
}