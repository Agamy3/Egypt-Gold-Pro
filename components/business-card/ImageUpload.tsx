'use client';

import { useState, useRef } from 'react';

interface ImageUploadProps {
  currentUrl?: string;
  onImageChange: (url: string | null) => void;
  type: 'avatar' | 'banner' | 'company_logo';
  label: string;
  description?: string;
  className?: string;
}

export default function ImageUpload({
  currentUrl,
  onImageChange,
  type,
  label,
  description,
  className = '',
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      // Create form data
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);

      // Upload to API
      const response = await fetch('/api/business-cards/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed');
      }

      // Update preview and notify parent
      setPreviewUrl(result.data.url);
      onImageChange(result.data.url);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!previewUrl) return;

    try {
      // Extract filename from URL (this is a simplified approach)
      const filename = previewUrl.split('/').pop();
      
      if (filename) {
        // Delete from storage
        await fetch('/api/business-cards/upload', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ filename }),
        });
      }

      // Clear preview and notify parent
      setPreviewUrl(null);
      onImageChange(null);
      setError(null);

    } catch (err) {
      setError('Failed to remove image');
    }
  };

  const getDimensions = () => {
    switch (type) {
      case 'avatar':
        return { width: 150, height: 150 };
      case 'banner':
        return { width: 800, height: 200 };
      case 'company_logo':
        return { width: 120, height: 120 };
      default:
        return { width: 150, height: 150 };
    }
  };

  const dimensions = getDimensions();

  return (
    <div className={`space-y-3 ${className}`}>
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          {label}
        </label>
        {description && (
          <p className="text-xs text-gray-500">{description}</p>
        )}
      </div>

      {/* Preview Area */}
      <div className="relative">
        <div
          className="border-2 border-dashed border-gray-600 rounded-lg overflow-hidden bg-gray-800/50"
          style={{ width: dimensions.width, maxWidth: '100%' }}
        >
          {previewUrl ? (
            <div className="relative group">
              <img
                src={previewUrl}
                alt={label}
                className="w-full h-full object-cover"
                style={{ 
                  width: dimensions.width, 
                  height: dimensions.height,
                  maxHeight: '300px'
                }}
              />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
                  disabled={uploading}
                >
                  {uploading ? 'Uploading...' : 'Replace'}
                </button>
                <button
                  type="button"
                  onClick={handleRemove}
                  className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors"
                  disabled={uploading}
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <div
              className="flex flex-col items-center justify-center text-gray-400 hover:text-gray-300 transition-colors cursor-pointer"
              style={{ 
                width: dimensions.width, 
                height: dimensions.height,
                minHeight: '120px'
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <svg
                className="w-8 h-8 mb-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <span className="text-sm text-center">
                {uploading ? 'Uploading...' : `Click to upload ${label.toLowerCase()}`}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleFileSelect}
        className="hidden"
        disabled={uploading}
      />

      {/* Error Message */}
      {error && (
        <div className="text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Upload Guidelines */}
      <div className="text-xs text-gray-500 space-y-1">
        <div>Allowed formats: JPEG, PNG, WebP, GIF</div>
        <div>Maximum size: 5MB</div>
        {type === 'avatar' && (
          <div>Recommended: 150x150px (minimum 100x100)</div>
        )}
        {type === 'banner' && (
          <div>Recommended: 1200x300px (minimum 800x200)</div>
        )}
        {type === 'company_logo' && (
          <div>Recommended: 120x120px (minimum 50x50)</div>
        )}
      </div>
    </div>
  );
}
