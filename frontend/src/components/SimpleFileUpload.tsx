import React, { useState, useRef } from 'react';
import { apiService } from '../services/api';
import { useToast } from '../hooks/use-toast';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

interface SimpleFileUploadProps {
  projectId: string;
  onUploadSuccess?: (testCases: any[]) => void;
  onUploadError?: (error: string) => void;
}

export const SimpleFileUpload: React.FC<SimpleFileUploadProps> = ({ 
  projectId, 
  onUploadSuccess,
  onUploadError 
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      console.log('File selected:', {
        name: selectedFile.name,
        size: selectedFile.size,
        type: selectedFile.type,
        lastModified: new Date(selectedFile.lastModified).toISOString()
      });
      
      // Basic validation
      const validTypes = ['.xlsx', '.xls', '.csv'];
      const fileExt = selectedFile.name.toLowerCase().substring(selectedFile.name.lastIndexOf('.'));
      
      if (!validTypes.includes(fileExt)) {
        toast({
          title: "Invalid File Type",
          description: `Please select a valid Excel (.xlsx, .xls) or CSV file.`,
          variant: "destructive"
        });
        return;
      }
      
      setFile(selectedFile);
      toast({
        title: "File Selected",
        description: `${selectedFile.name} is ready to upload.`
      });
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast({
        title: "No File Selected",
        description: "Please select a file to upload.",
        variant: "destructive"
      });
      return;
    }

    console.log('Starting upload:', {
      projectId,
      file: {
        name: file.name,
        size: file.size,
        type: file.type
      }
    });

    setIsUploading(true);

    try {
      // Create FormData and append file
      const formData = new FormData();
      formData.append('file', file);
      
      console.log('FormData created, uploading to:', `/api/projects/${projectId}/test-cases/upload`);
      
      // Direct API call to ensure file is passed
      const response = await fetch(`http://backend:8000/api/projects/${projectId}/test-cases/upload`, {
        method: 'POST',
        body: formData,
        headers: {
          'Origin': window.location.origin
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Upload failed');
      }

      const result = await response.json();
      console.log('Upload successful:', result);

      toast({
        title: "Upload Successful",
        description: `${file.name} has been uploaded successfully.`
      });

      // Reset form
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      if (onUploadSuccess) {
        onUploadSuccess(result.data?.testCases || []);
      }

    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload file. Please try again.",
        variant: "destructive"
      });
      
      if (onUploadError) {
        onUploadError(error.message);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Excel Test Cases</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />

          {/* File selection button */}
          <Button
            onClick={handleButtonClick}
            variant="outline"
            className="w-full"
            disabled={isUploading}
          >
            {file ? `Selected: ${file.name}` : 'Select File'}
          </Button>

          {/* File info */}
          {file && (
            <div className="p-3 bg-gray-50 rounded-md text-sm">
              <p><strong>Name:</strong> {file.name}</p>
              <p><strong>Size:</strong> {(file.size / 1024).toFixed(2)} KB</p>
              <p><strong>Type:</strong> {file.type || 'Unknown'}</p>
            </div>
          )}

          {/* Upload button */}
          <Button
            onClick={handleUpload}
            disabled={!file || isUploading}
            className="w-full"
          >
            {isUploading ? 'Uploading...' : 'Upload File'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};