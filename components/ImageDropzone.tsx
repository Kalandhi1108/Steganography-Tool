
import React, { useState, useCallback, useEffect } from 'react';
import { UploadCloudIcon, ImageIcon } from './icons';

interface ImageDropzoneProps {
    file: File | null;
    onFileChange: (file: File | null) => void;
}

export const ImageDropzone: React.FC<ImageDropzoneProps> = ({ file, onFileChange }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    useEffect(() => {
        if (file) {
            const objectUrl = URL.createObjectURL(file);
            setPreviewUrl(objectUrl);
            return () => URL.revokeObjectURL(objectUrl);
        } else {
            setPreviewUrl(null);
        }
    }, [file]);

    const handleFileChange = (files: FileList | null) => {
        if (files && files.length > 0) {
            onFileChange(files[0]);
        }
    };

    const onDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    }, []);

    const onDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    }, []);

    const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        handleFileChange(e.dataTransfer.files);
    }, [onFileChange]);

    if (previewUrl) {
        return (
            <div className="relative group">
                <img src={previewUrl} alt="Preview" className="w-full h-auto max-h-80 object-contain rounded-lg" />
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
                    <button onClick={() => onFileChange(null)} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700">
                        Remove
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
            onDragOver={onDragOver}
            onDrop={onDrop}
            className={`flex items-center justify-center w-full relative border-2 border-dashed rounded-lg transition-colors p-8
                ${isDragging ? 'border-brand-cyan bg-brand-accent/30' : 'border-brand-accent bg-brand-primary'}`}
        >
            <div className="text-center">
                <UploadCloudIcon className="mx-auto h-12 w-12 text-brand-light" />
                <p className="mt-2 text-sm text-brand-light">
                    <span className="font-semibold text-brand-cyan">Click to upload</span> or drag and drop
                </p>
                <p className="text-xs text-brand-accent">PNG, JPG, BMP accepted</p>
            </div>
            <input
                type="file"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                accept="image/png, image/jpeg, image/bmp"
                onChange={(e) => handleFileChange(e.target.files)}
            />
        </div>
    );
};
