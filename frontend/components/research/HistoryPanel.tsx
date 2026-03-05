"use client";

import { memo } from "react";
import { useRouter } from "next/navigation";
import {
    Zap,
    Search,
    Trash2,
    RotateCcw,
    X,
    Clock,
} from "lucide-react";
import { getAccessToken } from "@/lib/supabase";

interface ResearchItem {
    id: string;
    idea_text: string;
    analysis_type: string;
    status: string;
    created_at: string;
}

interface HistoryPanelProps {
    history: ResearchItem[];
    historyLoading: boolean;
    onRefresh: () => void;
    onDeleteAll: () => void;
    onItemDeleted: (id: string) => void;
    /** When true, renders as a mobile full-screen overlay */
    mobile?: boolean;
    onClose?: () => void;
}

function HistoryList({
    history,
    historyLoading,
    onRefresh,
    onDeleteAll,
    onItemDeleted,
}: Omit<HistoryPanelProps, "mobile" | "onClose">) {
    const router = useRouter();

    return (
        <>
            <div className="flex items-center justify-between p-5 border-b border-border/50">
                <p className="text-[10px] font-mono text-text-secondary uppercase tracking-[0.2em] font-medium">
                    Past Research
                </p>
                <div className="flex items-center gap-1">
                    <button
                        onClick={onDeleteAll}
                        className="text-text-tertiary hover:text-accent-green p-1.5 transition-colors rounded-full hover:bg-accent-green/10"
                        title="Delete all"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={onRefresh}
                        className="text-text-tertiary hover:text-accent-green p-1.5 transition-colors rounded-full hover:bg-accent-green/10"
                        title="Refresh"
                    >
                        <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            <div className="flex-grow overflow-y-auto">
                {historyLoading ? (
                    <div className="divide-y divide-border-strong">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-24 bg-background-raised animate-pulse" />
                        ))}
                    </div>
                ) : history.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 px-6">
                        <Clock className="w-8 h-8 text-border-strong mb-3" />
                        <p className="text-sm font-medium text-ink-900 mb-1">No research yet</p>
                        <p className="text-xs text-text-tertiary text-center">
                            Your analysis history will appear here after you run a search.
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-border/30 p-2">
                        {history.map((item) => (
                            <div key={item.id} className="relative group">
                                <button
                                    onClick={() => router.push(`/appgroup/research/${item.id}`)}
                                    className="w-full text-left p-3 hover:bg-white rounded-md transition-all mb-1 block border border-transparent hover:border-border/50 hover:shadow-sm pr-8"
                                >
                                    <p className="text-sm font-sans font-medium line-clamp-2 mb-2 leading-relaxed text-ink-900 group-hover:text-accent-green transition-colors">
                                        {item.idea_text}
                                    </p>
                                    <div className="flex items-center gap-2 text-[10px] font-mono text-text-tertiary uppercase tracking-widest">
                                        {item.analysis_type === "deep" ? (
                                            <Search className="w-3 h-3 text-accent" />
                                        ) : (
                                            <Zap className="w-3 h-3 text-accent-green" />
                                        )}
                                        <span>{item.analysis_type}</span>
                                        <span className="opacity-50">&middot;</span>
                                        <span>{new Date(item.created_at).toLocaleDateString()}</span>
                                    </div>
                                </button>
                                <button
                                    onClick={async (e) => {
                                        e.stopPropagation();
                                        try {
                                            const token = await getAccessToken();
                                            await fetch(
                                                `${process.env.NEXT_PUBLIC_API_URL}/api/research/${item.id}`,
                                                {
                                                    method: "DELETE",
                                                    headers: token
                                                        ? { Authorization: `Bearer ${token}` }
                                                        : {},
                                                }
                                            );
                                            onItemDeleted(item.id);
                                        } catch { }
                                    }}
                                    className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-accent transition-all p-1.5 rounded-full hover:bg-accent/10"
                                    title="Delete research"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}

const HistoryPanel = memo(function HistoryPanel(props: HistoryPanelProps) {
    const { mobile, onClose, ...listProps } = props;

    // Mobile: full-screen overlay
    if (mobile) {
        return (
            <div className="fixed inset-0 z-50 lg:hidden flex flex-col bg-background">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 bg-white shrink-0">
                    <h2 className="text-base font-medium text-ink-900">Research History</h2>
                    <button
                        onClick={onClose}
                        className="text-text-tertiary hover:text-ink-900 p-2 rounded-full hover:bg-background-raised transition-colors -mr-1"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                {/* History list fills remaining space */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    <HistoryList {...listProps} />
                </div>
            </div>
        );
    }

    // Desktop sidebar content (no wrapper — parent provides <aside>)
    return <HistoryList {...listProps} />;
});

export default HistoryPanel;
