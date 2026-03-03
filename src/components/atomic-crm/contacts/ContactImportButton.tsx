import { useEffect, useState, useCallback } from "react";
import type { MouseEvent } from "react";
import { Upload, Loader2 } from "lucide-react";
import { Form, useRefresh } from "ra-core";
import { Link } from "react-router";
import * as Papa from "papaparse";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormToolbar } from "@/components/admin/simple-form";
import { FileInput } from "@/components/admin/file-input";
import { FileField } from "@/components/admin/file-field";

import { usePapaParse } from "../misc/usePapaParse";
import type { ContactImportSchema } from "./useContactImport";
import { useContactImport } from "./useContactImport";
import { ColumnMappingStep } from "./ColumnMappingStep";
import * as sampleCsv from "./contacts_export.csv?raw";

export const ContactImportButton = () => {
  const [modalOpen, setModalOpen] = useState(false);

  const handleOpenModal = () => {
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={handleOpenModal}
        className="flex items-center gap-2 cursor-pointer"
      >
        <Upload /> Import CSV
      </Button>
      <ContactImportDialog open={modalOpen} onClose={handleCloseModal} />
    </>
  );
};

const SAMPLE_URL = `data:text/csv;name=crm_contacts_sample.csv;charset=utf-8,${encodeURIComponent(
  sampleCsv.default,
)}`;

type ContactImportModalProps = {
  open: boolean;
  onClose(): void;
};

type DialogState = "idle" | "mapping" | "running" | "complete" | "error";

export function ContactImportDialog({
  open,
  onClose,
}: ContactImportModalProps) {
  const refresh = useRefresh();
  const processBatch = useContactImport();
  const { importer, parseCsv, reset } = usePapaParse<ContactImportSchema>({
    batchSize: 10,
    processBatch,
  });

  const [file, setFile] = useState<File | null>(null);
  const [dialogState, setDialogState] = useState<DialogState>("idle");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRawRows, setCsvRawRows] = useState<Record<string, string>[]>([]);
  const [sampleRows, setSampleRows] = useState<Record<string, string>[]>([]);

  useEffect(() => {
    if (importer.state === "complete") {
      setDialogState("complete");
      refresh();
    } else if (importer.state === "error") {
      setDialogState("error");
    } else if (importer.state === "running") {
      setDialogState("running");
    }
  }, [importer.state, refresh]);

  const handleFileChange = (file: File | null) => {
    setFile(file);
  };

  // Step 1: Parse CSV to extract headers and sample data for mapping
  const startMapping = useCallback(() => {
    if (!file) return;

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false, // Keep as strings for mapping preview
      complete(results) {
        const headers = results.meta.fields ?? [];
        setCsvHeaders(headers);
        setCsvRawRows(results.data);
        setSampleRows(results.data.slice(0, 3));
        setDialogState("mapping");
      },
      error(error) {
        console.error("Failed to parse CSV:", error);
        setDialogState("error");
      },
    });
  }, [file]);

  // Step 2: Apply mapping and start import
  const handleConfirmMapping = useCallback(
    (
      applyMapping: (
        rows: Record<string, string>[]
      ) => ContactImportSchema[]
    ) => {
      const mappedData = applyMapping(csvRawRows);
      setDialogState("running");

      // Process in batches
      const batchSize = 10;
      let importCount = 0;
      let errorCount = 0;

      const processAllBatches = async () => {
        for (let i = 0; i < mappedData.length; i += batchSize) {
          const batch = mappedData.slice(i, i + batchSize);
          try {
            await processBatch(batch);
            importCount += batch.length;
          } catch (error) {
            console.error("Failed to import batch", error);
            errorCount += batch.length;
          }
        }
        setDialogState("complete");
        refresh();
      };

      processAllBatches();
    },
    [csvRawRows, processBatch, refresh]
  );

  const handleBack = useCallback(() => {
    setDialogState("idle");
    setCsvHeaders([]);
    setCsvRawRows([]);
    setSampleRows([]);
  }, []);

  const handleClose = () => {
    reset();
    setDialogState("idle");
    setCsvHeaders([]);
    setCsvRawRows([]);
    setSampleRows([]);
    setFile(null);
    onClose();
  };

  const handleReset = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    reset();
    setDialogState("idle");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <Form className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {dialogState === "mapping"
                ? "Map Columns"
                : dialogState === "running"
                  ? "Importing..."
                  : dialogState === "complete"
                    ? "Import Complete"
                    : "Import"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col space-y-2">
            {/* MAPPING STATE */}
            {dialogState === "mapping" && (
              <ColumnMappingStep
                csvHeaders={csvHeaders}
                sampleRows={sampleRows}
                onConfirm={handleConfirmMapping}
                onBack={handleBack}
              />
            )}

            {/* RUNNING STATE */}
            {dialogState === "running" && (
              <div className="flex flex-col gap-2">
                <Alert>
                  <AlertDescription className="flex flex-row gap-4">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    The import is running, please do not close this tab.
                  </AlertDescription>
                </Alert>

                {importer.state === "running" && (
                  <div className="text-sm">
                    Imported{" "}
                    <strong>
                      {importer.importCount} / {importer.rowCount}
                    </strong>{" "}
                    contacts, with{" "}
                    <strong>{importer.errorCount}</strong> errors.
                    {importer.remainingTime !== null && (
                      <>
                        {" "}
                        Estimated remaining time:{" "}
                        <strong>
                          {millisecondsToTime(importer.remainingTime)}
                        </strong>
                        .{" "}
                        <button
                          onClick={handleReset}
                          className="text-red-600 underline hover:text-red-800"
                        >
                          Stop import
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ERROR STATE */}
            {dialogState === "error" && (
              <Alert variant="destructive">
                <AlertDescription>
                  Failed to import this file, please make sure you provided a
                  valid CSV file.
                </AlertDescription>
              </Alert>
            )}

            {/* COMPLETE STATE */}
            {dialogState === "complete" && (
              <Alert>
                <AlertDescription>
                  Contacts import complete.
                  {importer.state === "complete" && (
                    <>
                      {" "}
                      Imported {importer.importCount} contacts, with{" "}
                      {importer.errorCount} errors
                    </>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* IDLE STATE */}
            {dialogState === "idle" && (
              <>
                <Alert>
                  <AlertDescription className="flex flex-col gap-4">
                    Upload a CSV file. You'll be able to map columns to CRM
                    fields before importing.
                    <Button asChild variant="outline" size="sm">
                      <Link
                        to={SAMPLE_URL}
                        download={"crm_contacts_sample.csv"}
                      >
                        Download CSV sample
                      </Link>
                    </Button>{" "}
                  </AlertDescription>
                </Alert>

                <FileInput
                  source="csv"
                  label="CSV File"
                  accept={{ "text/csv": [".csv"] }}
                  onChange={handleFileChange}
                >
                  <FileField source="src" title="title" target="_blank" />
                </FileInput>
              </>
            )}
          </div>
        </Form>

        {/* Bottom actions for idle/complete/error states */}
        {dialogState !== "mapping" && (
          <div className="flex justify-start pt-6">
            <FormToolbar>
              {dialogState === "idle" ? (
                <Button onClick={startMapping} disabled={!file}>
                  Next: Map Columns
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={handleClose}
                  disabled={dialogState === "running"}
                >
                  Close
                </Button>
              )}
            </FormToolbar>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function millisecondsToTime(ms: number) {
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (60 * 1000)) % 60);

  return `${minutes}m ${seconds}s`;
}
