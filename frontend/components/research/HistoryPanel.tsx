"use client";

import { memo } from "react";
import { useRouter } from "next/navigation";
import {
    Zap,
    Search,
    Trash2,
    RotateCcw,
    X,
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
    /** When true, renders as a mobile overlay instead of sidebar content */
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
                    <p className="text-xs font-mono p-4 text-text-tertiary">
                        No research yet.
                    </p>
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

    // Mobile overlay
    if (mobile) {
        return (
            <div className="fixed inset-0 z-50 lg:hidden">
                <div
                    className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                    onClick={onClose}
                />
                <div className="absolute bottom-0 left-0 right-0 bg-background-raised rounded-t-2xl max-h-[80vh] flex flex-col animate-slide-up shadow-2xl">
                    <div className="flex items-center justify-between px-5 pt-4 pb-2">
                        <p className="text-sm font-medium text-ink-900">Research History</p>
                        <button
                            onClick={onClose}
                            className="text-text-tertiary hover:text-ink-900 p-1.5 rounded-full hover:bg-background transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <HistoryList {...listProps} />
                </div>
            </div>
        );
    }

    // Desktop sidebar content (no wrapper — parent provides <aside>)
    return <HistoryList {...listProps} />;
});

export default HistoryPanel;
