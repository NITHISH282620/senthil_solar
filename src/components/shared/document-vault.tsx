"use client";

import { useState, useRef, useEffect } from "react";
import { 
  UploadCloud, 
  FileIcon, 
  Trash2, 
  Download, 
  Eye, 
  Loader2,
  FileText,
  Image as ImageIcon,
  FileSpreadsheet
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { uploadDocument, deleteDocument, getSignedUrl, type DocumentWithUploader } from "@/actions/documents";
import { formatDate } from "@/lib/format";

interface DocumentVaultProps {
  entityType: "employee" | "customer" | "work_order" | "quotation" | "invoice" | "expense" | "general";
  entityId?: string;
  initialDocuments?: DocumentWithUploader[];
}

export function DocumentVault({ entityType, entityId, initialDocuments = [] }: DocumentVaultProps) {
  const [documents, setDocuments] = useState<DocumentWithUploader[]>(initialDocuments);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  // Upload Form State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [docName, setDocName] = useState("");
  const [category, setCategory] = useState<string>("other");
  
  // Preview State
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DocumentWithUploader | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  // Update local state when props change
  useEffect(() => {
    setDocuments(initialDocuments);
  }, [initialDocuments]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (file: File) => {
    // Max 10MB
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File is too large (Max 10MB)");
      return;
    }
    
    setSelectedFile(file);
    if (!docName) {
      // Pre-fill name from file without extension
      setDocName(file.name.split('.').slice(0, -1).join('.'));
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !docName) {
      toast.error("Please provide a file and a name");
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("name", docName);
    formData.append("category", category);
    formData.append("entity_type", entityType);
    if (entityId) {
      formData.append("entity_id", entityId);
    }

    try {
      const result = await uploadDocument(formData);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Document uploaded successfully");
        // Reset form
        setSelectedFile(null);
        setDocName("");
        if (fileInputRef.current) fileInputRef.current.value = "";
        
        // Note: The parent should ideally re-fetch or we use router.refresh() 
        // which the server action handles, but we might need to rely on the page reload
        // since we are using local state for immediate UI feedback if we wanted.
        // The server action calls revalidatePath, so Next.js should refresh the data.
      }
    } catch (error) {
      toast.error("An unexpected error occurred");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this document?")) return;

    try {
      // Optimistic UI update
      setDocuments(documents.filter(d => d.id !== id));
      
      const result = await deleteDocument(id);
      if (result.error) {
        toast.error(result.error);
        // Revert optimistic update
        setDocuments(initialDocuments);
      } else {
        toast.success("Document deleted");
      }
    } catch (error) {
      toast.error("Failed to delete document");
      setDocuments(initialDocuments);
    }
  };

  const handlePreview = async (doc: DocumentWithUploader) => {
    setIsPreviewLoading(true);
    setPreviewDoc(doc);
    
    try {
      const result = await getSignedUrl(doc.file_url);
      if (result.error || !result.data) {
        toast.error(result.error || "Failed to generate preview URL");
        setPreviewDoc(null);
      } else {
        setPreviewUrl(result.data);
      }
    } catch (error) {
      toast.error("Failed to load document");
      setPreviewDoc(null);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const getFileIcon = (fileType: string | null) => {
    if (!fileType) return <FileIcon className="h-8 w-8 text-muted-foreground" />;
    if (fileType.includes("pdf")) return <FileText className="h-8 w-8 text-rose-500" />;
    if (fileType.includes("image")) return <ImageIcon className="h-8 w-8 text-sky-500" />;
    if (fileType.includes("spreadsheet") || fileType.includes("excel") || fileType.includes("csv")) {
      return <FileSpreadsheet className="h-8 w-8 text-emerald-500" />;
    }
    return <FileIcon className="h-8 w-8 text-muted-foreground" />;
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Document Vault</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Upload Zone */}
        <div 
          className={`border-2 border-dashed rounded-xl p-6 transition-colors ${
            isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {!selectedFile ? (
            <div className="flex flex-col items-center justify-center text-center space-y-3">
              <div className="p-3 bg-muted rounded-full">
                <UploadCloud className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Drag & drop your file here</p>
                <p className="text-xs text-muted-foreground mt-1">or click to browse (Max 10MB)</p>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                Select File
              </Button>
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleFileSelect(e.target.files[0]);
                  }
                }}
              />
            </div>
          ) : (
            <div className="space-y-4 max-w-md mx-auto">
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border">
                {getFileIcon(selectedFile.type)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setSelectedFile(null)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
              
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Document Name</Label>
                  <Input 
                    value={docName} 
                    onChange={(e) => setDocName(e.target.value)} 
                    placeholder="e.g. Site Survey Plan"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Category</Label>
                  <Select value={category} onValueChange={(v) => setCategory(v || "other")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="photo">Photo</SelectItem>
                      <SelectItem value="agreement">Agreement / Contract</SelectItem>
                      <SelectItem value="permit">Permit / License</SelectItem>
                      <SelectItem value="id_proof">ID Proof</SelectItem>
                      <SelectItem value="report">Report</SelectItem>
                      <SelectItem value="invoice">Invoice / Receipt</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button 
                  className="w-full" 
                  onClick={handleUpload}
                  disabled={isUploading || !docName}
                >
                  {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Upload Document
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Document List */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Attached Documents ({documents.length})</h3>
          
          {documents.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground border rounded-lg bg-muted/20">
              No documents attached yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-start gap-3 p-3 border rounded-xl bg-card hover:border-primary/50 transition-colors group relative">
                  <div className="shrink-0 mt-1">
                    {getFileIcon(doc.file_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" title={doc.name}>{doc.name}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span className="capitalize">{doc.category?.replace('_', ' ')}</span>
                      <span>•</span>
                      <span>{formatFileSize(doc.file_size)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 truncate">
                      {formatDate(doc.created_at)} by {doc.uploader?.full_name || "Unknown"}
                    </div>
                  </div>
                  
                  {/* Actions overlay */}
                  <div className="absolute top-2 right-2 flex opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm rounded-md shadow-sm border">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handlePreview(doc)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(doc.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>

      {/* Preview Dialog */}
      <Dialog open={!!previewDoc} onOpenChange={(open) => !open && setPreviewDoc(null)}>
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span className="truncate pr-4">{previewDoc?.name}</span>
              {previewUrl && (
                <a href={previewUrl} download={previewDoc?.name} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-8 px-3">
                  <Download className="mr-2 h-4 w-4" /> Download
                </a>
              )}
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 bg-muted/30 rounded-md border flex items-center justify-center overflow-hidden relative">
            {isPreviewLoading ? (
              <div className="flex flex-col items-center text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mb-2" />
                <p>Generating secure link...</p>
              </div>
            ) : previewUrl ? (
              previewDoc?.file_type?.includes("image") ? (
                <img 
                  src={previewUrl} 
                  alt={previewDoc.name} 
                  className="max-w-full max-h-full object-contain"
                />
              ) : previewDoc?.file_type?.includes("pdf") ? (
                <iframe 
                  src={`${previewUrl}#toolbar=0`} 
                  className="w-full h-full border-0"
                  title={previewDoc.name}
                />
              ) : (
                <div className="text-center p-8">
                  <FileIcon className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                  <p className="mb-4">Preview not available for this file type.</p>
                  <a href={previewUrl} download={previewDoc?.name} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2">
                    <Download className="mr-2 h-4 w-4" /> Download File
                  </a>
                </div>
              )
            ) : (
              <p className="text-muted-foreground">Failed to load preview.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
