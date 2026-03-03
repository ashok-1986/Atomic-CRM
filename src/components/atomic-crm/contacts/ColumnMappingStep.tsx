import { useMemo } from "react";
import { ArrowRight, AlertCircle, Check } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { CRM_FIELDS, useColumnMapping } from "./useColumnMapping";
import type { ContactImportSchema } from "./useContactImport";

const UNMAPPED = "__unmapped__";

interface ColumnMappingStepProps {
    csvHeaders: string[];
    sampleRows: Record<string, string>[];
    onConfirm: (
        applyMapping: (
            rows: Record<string, string>[]
        ) => ContactImportSchema[]
    ) => void;
    onBack: () => void;
}

export const ColumnMappingStep = ({
    csvHeaders,
    sampleRows,
    onConfirm,
    onBack,
}: ColumnMappingStepProps) => {
    const { mapping, updateMapping, isValid, applyMapping } =
        useColumnMapping(csvHeaders);

    const mappedCount = useMemo(
        () => Object.values(mapping).filter(Boolean).length,
        [mapping]
    );

    const requiredMissing = useMemo(
        () =>
            CRM_FIELDS.filter((f) => f.required).filter(
                (f) => !Object.values(mapping).includes(f.key)
            ),
        [mapping]
    );

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                    {mappedCount} of {csvHeaders.length} columns mapped
                </div>
                {requiredMissing.length > 0 && (
                    <div className="flex items-center gap-1 text-sm text-destructive">
                        <AlertCircle className="h-4 w-4" />
                        Missing required: {requiredMissing.map((f) => f.label).join(", ")}
                    </div>
                )}
            </div>

            <div className="max-h-[400px] overflow-y-auto border rounded-lg">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[200px]">CSV Column</TableHead>
                            <TableHead className="w-[40px]" />
                            <TableHead className="w-[200px]">CRM Field</TableHead>
                            <TableHead>Preview</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {csvHeaders.map((header) => {
                            const crmField = mapping[header] || "";
                            const sampleValue = sampleRows[0]?.[header] ?? "";

                            return (
                                <TableRow key={header}>
                                    <TableCell className="font-medium">{header}</TableCell>
                                    <TableCell>
                                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                    </TableCell>
                                    <TableCell>
                                        <Select
                                            value={crmField || UNMAPPED}
                                            onValueChange={(value) =>
                                                updateMapping(
                                                    header,
                                                    value === UNMAPPED
                                                        ? ""
                                                        : (value as keyof ContactImportSchema)
                                                )
                                            }
                                        >
                                            <SelectTrigger className="w-full">
                                                <SelectValue placeholder="Skip this column" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value={UNMAPPED}>
                                                    <span className="text-muted-foreground">
                                                        — Skip —
                                                    </span>
                                                </SelectItem>
                                                {CRM_FIELDS.map((field) => {
                                                    const isUsed =
                                                        Object.values(mapping).includes(field.key) &&
                                                        mapping[header] !== field.key;
                                                    return (
                                                        <SelectItem
                                                            key={field.key}
                                                            value={field.key}
                                                            disabled={isUsed}
                                                        >
                                                            {field.label}
                                                            {field.required && " *"}
                                                            {isUsed && " (already mapped)"}
                                                        </SelectItem>
                                                    );
                                                })}
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground truncate max-w-[200px]">
                                        {sampleValue || (
                                            <span className="italic">empty</span>
                                        )}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>

            {sampleRows.length > 0 && isValid && (
                <Alert>
                    <Check className="h-4 w-4" />
                    <AlertDescription>
                        Ready to import. First row preview:{" "}
                        <strong>
                            {sampleRows[0]?.[
                                Object.entries(mapping).find(
                                    ([, v]) => v === "first_name"
                                )?.[0] ?? ""
                            ] ?? ""}{" "}
                            {sampleRows[0]?.[
                                Object.entries(mapping).find(
                                    ([, v]) => v === "last_name"
                                )?.[0] ?? ""
                            ] ?? ""}
                        </strong>
                    </AlertDescription>
                </Alert>
            )}

            <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={onBack}>
                    Back
                </Button>
                <Button onClick={() => onConfirm(applyMapping)} disabled={!isValid}>
                    Confirm Mapping & Import
                </Button>
            </div>
        </div>
    );
};
