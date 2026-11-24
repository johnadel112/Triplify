import React, { useState } from 'react';
import { itinerariesApi } from './itineraries.api';

interface Props {
  imageUrls: string[];
  onChange: (urls: string[]) => void;
}

export const ActivityImageUploader: React.FC<Props> = ({ imageUrls, onChange }) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setError(null);

    try {
      const uploadedUrls: string[] = [];
      for (const file of Array.from(files)) {
        const res = await itinerariesApi.uploadActivityImage(file);
        uploadedUrls.push(res.url);
      }
      onChange([...imageUrls, ...uploadedUrls]);
    } catch (err: any) {
      setError(err.message || 'Failed to upload image');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removeImage = (url: string) => {
    onChange(imageUrls.filter((item) => item !== url));
  };

  return (
    <div>
      <label>
        Activity Images
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileChange}
          disabled={uploading}
        />
      </label>
      {uploading && <span>Uploading...</span>}
      {error && <p role="alert">{error}</p>}
      <div>
        {imageUrls.map((url) => (
          <div key={url}>
            <img src={url} alt="Activity" width={96} height={72} />
            <button type="button" onClick={() => removeImage(url)}>
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};