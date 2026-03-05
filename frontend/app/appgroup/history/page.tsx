"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { getResearchHistory } from "@/services/api";
import HistoryPanel from "@/components/research/HistoryPanel";

export default function MobileHistoryPage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();

    const [history, setHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(true);

    useEffect(() => {
        if (!authLoading && !user) {
            router.push("/auth/login?returnTo=/appgroup/history");
            return;
        }
        if (user) {
            loadHistory();
        }
    }, [user, authLoading, router]);

    const loadHistory = async () => {
        setHistoryLoading(true);
        try {
            const items = await getResearchHistory();
            setHistory(items);
        } catch {
        } finally {
            setHistoryLoading(false);
        }
    };

    if (authLoading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-border-strong border-t-ink-900 rounded-full animate-spin" />
            </div>
        );
    }

    if (!user) return null;

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <header className="border-b border-border/50 bg-white sticky top-0 z-40">
                <div className="w-full h-16 px-4 flex items-center gap-4">
                    <Link href="/appgroup/dashboard" className="text-ink-900 hover:bg-background-raised p-2 rounded-full transition-colors -ml-2">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <h1 className="font-sans font-medium text-ink-900">Research History</h1>
                </div>
            </header>

            <main className="flex-1 overflow-hidden flex flex-col pt-2">
                <HistoryPanel
                    history={history}
                    historyLoading={historyLoading}
                    onRefresh={loadHistory}
                    onDeleteAll={() => { }} // Could wire this up to a modal here if needed, but not strictly necessary for viewing
                    onItemDeleted={(id) => setHistory((prev) => prev.filter((h: any) => h.id !== id))}
                />
            </main>
        </div>
    );
}
