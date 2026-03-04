import { Copy, Key, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNotify } from "ra-core";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "../providers/supabase/supabase";

interface ApiKey {
    id: number;
    name: string;
    key_prefix: string;
    created_at: string;
    last_used_at: string | null;
    revoked_at: string | null;
    permissions: { read: boolean; write: boolean };
}

export function ApiKeysSection() {
    const [keys, setKeys] = useState<ApiKey[]>([]);
    const [loading, setLoading] = useState(true);
    const [newKeyName, setNewKeyName] = useState("");
    const [generatedKey, setGeneratedKey] = useState<string | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const notify = useNotify();

    const fetchKeys = useCallback(async () => {
        const { data, error } = await supabase
            .from("api_keys")
            .select(
                "id, name, key_prefix, created_at, last_used_at, revoked_at, permissions"
            )
            .order("created_at", { ascending: false });

        if (error) {
            notify("Failed to load API keys", { type: "error" });
            return;
        }
        setKeys(data ?? []);
        setLoading(false);
    }, [notify]);

    useEffect(() => {
        fetchKeys();
    }, [fetchKeys]);

    const handleCreate = async () => {
        if (!newKeyName.trim()) return;
        setCreating(true);

        try {
            // Generate key client-side
            const bytes = new Uint8Array(32);
            crypto.getRandomValues(bytes);
            const rawKey =
                "ak_" +
                Array.from(bytes)
                    .map((b) => b.toString(16).padStart(2, "0"))
                    .join("");

            // Hash it
            const encoder = new TextEncoder();
            const data = encoder.encode(rawKey);
            const hashBuffer = await crypto.subtle.digest("SHA-256", data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const keyHash = hashArray
                .map((b) => b.toString(16).padStart(2, "0"))
                .join("");
            const keyPrefix = rawKey.substring(0, 11);

            // Get current user's sales ID
            const {
                data: { user },
            } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");

            const { data: sale } = await supabase
                .from("sales")
                .select("id")
                .eq("user_id", user.id)
                .single();
            if (!sale) throw new Error("Sales record not found");

            // Insert into DB
            const { error } = await supabase.from("api_keys").insert({
                name: newKeyName.trim(),
                key_prefix: keyPrefix,
                key_hash: keyHash,
                created_by: sale.id,
                permissions: { read: true, write: true },
            });

            if (error) throw error;

            setGeneratedKey(rawKey);
            setNewKeyName("");
            fetchKeys();
            notify("API key created successfully");
        } catch (err: any) {
            notify(err.message || "Failed to create API key", { type: "error" });
        } finally {
            setCreating(false);
        }
    };

    const handleRevoke = async (keyId: number) => {
        const { error } = await supabase
            .from("api_keys")
            .update({ revoked_at: new Date().toISOString() })
            .eq("id", keyId);

        if (error) {
            notify("Failed to revoke key", { type: "error" });
            return;
        }
        notify("API key revoked");
        fetchKeys();
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        notify("Copied to clipboard");
    };

    return (
        <Card id="api-keys">
            <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-muted-foreground">
                        API Keys
                    </h2>
                    <Dialog
                        open={dialogOpen}
                        onOpenChange={(open) => {
                            setDialogOpen(open);
                            if (!open) {
                                setGeneratedKey(null);
                                setNewKeyName("");
                            }
                        }}
                    >
                        <DialogTrigger asChild>
                            <Button size="sm" variant="outline">
                                <Plus className="h-4 w-4 mr-1" />
                                Generate Key
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            {generatedKey ? (
                                <>
                                    <DialogHeader>
                                        <DialogTitle>API Key Created</DialogTitle>
                                        <DialogDescription>
                                            Copy this key now — it will not be shown again.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="flex items-center gap-2 p-3 bg-muted rounded-md font-mono text-sm break-all">
                                        <code className="flex-1">{generatedKey}</code>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => copyToClipboard(generatedKey)}
                                        >
                                            <Copy className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <DialogFooter>
                                        <Button onClick={() => setDialogOpen(false)}>Done</Button>
                                    </DialogFooter>
                                </>
                            ) : (
                                <>
                                    <DialogHeader>
                                        <DialogTitle>Generate New API Key</DialogTitle>
                                        <DialogDescription>
                                            Give this key a descriptive name (e.g. "Email Automation",
                                            "LinkedIn Integration").
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-2">
                                        <Label htmlFor="key-name">Key Name</Label>
                                        <Input
                                            id="key-name"
                                            value={newKeyName}
                                            onChange={(e) => setNewKeyName(e.target.value)}
                                            placeholder="e.g. Email Automation"
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") handleCreate();
                                            }}
                                        />
                                    </div>
                                    <DialogFooter>
                                        <Button
                                            variant="outline"
                                            onClick={() => setDialogOpen(false)}
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            onClick={handleCreate}
                                            disabled={!newKeyName.trim() || creating}
                                        >
                                            {creating ? "Generating..." : "Generate"}
                                        </Button>
                                    </DialogFooter>
                                </>
                            )}
                        </DialogContent>
                    </Dialog>
                </div>

                <p className="text-sm text-muted-foreground">
                    API keys allow external tools to access CRM data via the REST API.
                </p>

                {loading ? (
                    <p className="text-sm text-muted-foreground">Loading...</p>
                ) : keys.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                        <Key className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No API keys yet</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {keys.map((key) => (
                            <div
                                key={key.id}
                                className={`flex items-center justify-between p-3 rounded-md border ${key.revoked_at ? "opacity-50 bg-muted" : "bg-background"
                                    }`}
                            >
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium text-sm">{key.name}</span>
                                        {key.revoked_at && (
                                            <span className="text-xs px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">
                                                Revoked
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                                        <code>{key.key_prefix}...</code>
                                        <span>
                                            Created{" "}
                                            {new Date(key.created_at).toLocaleDateString()}
                                        </span>
                                        {key.last_used_at && (
                                            <span>
                                                Last used{" "}
                                                {new Date(key.last_used_at).toLocaleDateString()}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {!key.revoked_at && (
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="text-destructive hover:text-destructive"
                                        onClick={() => handleRevoke(key.id)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
