import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Dashboard — ShipOrSkip",
    description: "Validate your project ideas with AI-powered competitive intelligence.",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    return children;
}