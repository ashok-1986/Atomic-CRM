import { Loader2, Sparkles } from "lucide-react";
import { useCallback, useState } from "react";
import { useRecordContext } from "ra-core";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Markdown } from "../misc/Markdown";
import { supabase } from "../providers/supabase/supabase";
import type { Contact } from "../types";

export function ContactInsightsButton() {
    const record = useRecordContext<Contact>();
    const [insights, setInsights] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);

    const fetchInsights = useCallback(async () => {
        if (!record) return;
        setOpen(true);
        setLoading(true);
        setInsights(null);

        try {
            const {
                data: { session },
            } = await supabase.auth.getSession();

            const res = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai/insights/contact/${record.id}`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${session?.access_token}`,
                        apikey: import.meta.env.VITE_SB_PUBLISHABLE_KEY,
                    },
                }
            );

            if (!res.ok) {
                const err = await res.json().catch(() => ({ message: "AI service unavailable" }));
                throw new Error(err.message);
            }

            const data = await res.json();
            setInsights(data.insights);
        } catch (err: any) {
            setInsights(`⚠️ ${err.message || "Failed to generate insights"}`);
        } finally {
            setLoading(false);
        }
    }, [record]);

    if (!record) return null;

    return (
        <>
            <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={fetchInsights}
            >
                <Sparkles className="h-3.5 w-3.5" />
                AI Insights
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-primary" />
                            AI Insights: {record.first_name} {record.last_name}
                        </DialogTitle>
                    </DialogHeader>
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            <span className="ml-2 text-sm text-muted-foreground">
                                Analyzing contact...
                            </span>
                        </div>
                    ) : insights ? (
                        <Markdown className="prose prose-sm dark:prose-invert max-w-none">
                            {insights}
                        </Markdown>
                    ) : null}
                </DialogContent>
            </Dialog>
        </>
    );
}
