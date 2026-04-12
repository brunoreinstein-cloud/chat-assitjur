"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DocRef, KnowledgeDoc } from "@/lib/knowledge/types";

interface KnowledgeDialogsProps {
  docToView: DocRef | null;
  viewedDoc: (KnowledgeDoc & { content?: string }) | undefined;
  onCloseView: () => void;

  docToRename: DocRef | null;
  renameInputValue: string;
  setRenameInputValue: (value: string) => void;
  isPatchingDoc: boolean;
  onCloseRename: () => void;
  onRenameSubmit: () => void;

  docToDelete: DocRef | null;
  isDeleting: boolean;
  onCloseDelete: () => void;
  onDeleteConfirm: () => void;

  bulkDeleteConfirmOpen: boolean;
  isBulkDeleting: boolean;
  selectedCount: number;
  onCloseBulkDelete: () => void;
  onBulkDeleteConfirm: () => void;
}

export function KnowledgeDialogs({
  docToView,
  viewedDoc,
  onCloseView,
  docToRename,
  renameInputValue,
  setRenameInputValue,
  isPatchingDoc,
  onCloseRename,
  onRenameSubmit,
  docToDelete,
  isDeleting,
  onCloseDelete,
  onDeleteConfirm,
  bulkDeleteConfirmOpen,
  isBulkDeleting,
  selectedCount,
  onCloseBulkDelete,
  onBulkDeleteConfirm,
}: Readonly<KnowledgeDialogsProps>) {
  return (
    <>
      {/* View dialog */}
      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            onCloseView();
          }
        }}
        open={docToView !== null}
      >
        <DialogContent
          aria-describedby="view-doc-content"
          className="flex max-h-[85vh] max-w-2xl flex-col gap-2"
        >
          <DialogTitle id="view-doc-title">
            {docToView ? `Ver — ${docToView.title}` : "Documento"}
          </DialogTitle>
          <div
            className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded border border-border bg-muted/30 p-3 font-mono text-xs"
            id="view-doc-content"
          >
            {(() => {
              if (viewedDoc == null && docToView != null) {
                return (
                  <span className="text-muted-foreground">A carregar…</span>
                );
              }
              if (viewedDoc && typeof viewedDoc.content === "string") {
                return viewedDoc.content;
              }
              if (viewedDoc) {
                return (
                  <span className="text-muted-foreground">
                    Documento sem conteúdo.
                  </span>
                );
              }
              return null;
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            onCloseRename();
          }
        }}
        open={docToRename !== null}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Renomear documento</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="kb-rename-title">Título</Label>
            <Input
              id="kb-rename-title"
              maxLength={512}
              onChange={(e) => setRenameInputValue(e.target.value)}
              value={renameInputValue}
            />
          </div>
          <DialogFooter>
            <Button onClick={onCloseRename} type="button" variant="outline">
              Cancelar
            </Button>
            <Button
              disabled={!renameInputValue.trim() || isPatchingDoc}
              onClick={onRenameSubmit}
              type="button"
            >
              {isPatchingDoc ? "A guardar…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete single dialog */}
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            onCloseDelete();
          }
        }}
        open={docToDelete !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar documento?</AlertDialogTitle>
            <AlertDialogDescription>
              {docToDelete ? (
                <>
                  «{docToDelete.title}» será eliminado da base de conhecimento.
                  Esta ação não pode ser desfeita.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
              onClick={(e) => {
                e.preventDefault();
                onDeleteConfirm();
              }}
              type="button"
            >
              {isDeleting ? "A eliminar…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete dialog */}
      <AlertDialog
        onOpenChange={(open) => {
          if (!(open || isBulkDeleting)) {
            onCloseBulkDelete();
          }
        }}
        open={bulkDeleteConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Eliminar documentos selecionados?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedCount} documento(s) serão eliminados da base de
              conhecimento. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onCloseBulkDelete} type="button">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isBulkDeleting}
              onClick={(e) => {
                e.preventDefault();
                onBulkDeleteConfirm();
              }}
              type="button"
            >
              {isBulkDeleting ? "A eliminar…" : "Eliminar todos"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
