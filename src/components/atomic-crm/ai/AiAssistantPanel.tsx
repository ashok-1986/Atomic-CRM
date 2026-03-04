import { Bot, Send, Sparkles, X, Loader2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import { Markdown } from "../misc/Markdown";
import { supabase } from "../providers/supabase/supabase";

interface Message {
    role: "user" | "assistant";
    text: string;
}

const SUGGESTIONS = [
    "Give me a summary of the CRM pipeline",
    "Which contacts need follow-up?",
    "Draft an introductory email for our latest lead",
    "What deals are at risk of going cold?",
];

export function AiAssistantPanel() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const scrollToBottom = useCallback(() => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 100);
    }, []);

    const sendMessage = useCallback(
        async (text: string) => {
            if (!text.trim() || loading) return;

            const userMsg: Message = { role: "user", text: text.trim() };
            const newMessages = [...messages, userMsg];
            setMessages(newMessages);
            setInput("");
            setLoading(true);
            scrollToBottom();

            try {
                const {
                    data: { session },
                } = await supabase.auth.getSession();

                const res = await fetch(
                    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai/chat`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${session?.access_token}`,
                            apikey: import.meta.env.VITE_SB_PUBLISHABLE_KEY,
                        },
                        body: JSON.stringify({
                            message: text.trim(),
                            history: messages.map((m) => ({
                                role: m.role,
                                text: m.text,
                            })),
                        }),
                    }
                );

                if (!res.ok) {
                    const err = await res.json().catch(() => ({ message: "AI service unavailable" }));
                    throw new Error(err.message || `Error ${res.status}`);
                }

                const data = await res.json();
                setMessages([
                    ...newMessages,
                    { role: "assistant", text: data.reply },
                ]);
            } catch (err: any) {
                setMessages([
                    ...newMessages,
                    {
                        role: "assistant",
                        text: `⚠️ ${err.message || "Failed to get response. Please try again."}`,
                    },
                ]);
            } finally {
                setLoading(false);
                scrollToBottom();
            }
        },
        [messages, loading, scrollToBottom]
    );

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="relative"
                    title="AI Assistant"
                >
                    <Sparkles className="h-5 w-5" />
                </Button>
            </SheetTrigger>
            <SheetContent
                side="right"
                className="w-full sm:w-[480px] flex flex-col p-0 gap-0"
            >
                {/* Header */}
                <SheetHeader className="px-4 py-3 border-b shrink-0">
                    <div className="flex items-center justify-between">
                        <SheetTitle className="flex items-center gap-2 text-base">
                            <Bot className="h-5 w-5 text-primary" />
                            AI Assistant
                        </SheetTitle>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs"
                            onClick={() => setMessages([])}
                        >
                            Clear
                        </Button>
                    </div>
                </SheetHeader>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
                    {messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                            <Sparkles className="h-10 w-10 text-muted-foreground/30 mb-3" />
                            <p className="text-sm font-medium text-muted-foreground mb-1">
                                Ask me anything about your CRM
                            </p>
                            <p className="text-xs text-muted-foreground/70 mb-4">
                                I have access to your contacts, companies, and deals.
                            </p>
                            <div className="space-y-2 w-full max-w-xs">
                                {SUGGESTIONS.map((s, i) => (
                                    <button
                                        key={i}
                                        onClick={() => sendMessage(s)}
                                        className="w-full text-left text-xs px-3 py-2 rounded-md border hover:bg-muted transition-colors"
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        messages.map((msg, i) => (
                            <div
                                key={i}
                                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                            >
                                <div
                                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${msg.role === "user"
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-muted"
                                        }`}
                                >
                                    {msg.role === "assistant" ? (
                                        <Markdown className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                                            {msg.text}
                                        </Markdown>
                                    ) : (
                                        msg.text
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                    {loading && (
                        <div className="flex justify-start">
                            <div className="bg-muted rounded-lg px-3 py-2 flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Thinking...
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div className="px-4 py-3 border-t shrink-0">
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            sendMessage(input);
                        }}
                        className="flex items-center gap-2"
                    >
                        <input
                            ref={inputRef}
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Ask about your CRM data..."
                            className="flex-1 text-sm px-3 py-2 rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                            disabled={loading}
                        />
                        <Button
                            type="submit"
                            size="icon"
                            disabled={!input.trim() || loading}
                        >
                            <Send className="h-4 w-4" />
                        </Button>
                    </form>
                </div>
            </SheetContent>
        </Sheet>
    );
}
