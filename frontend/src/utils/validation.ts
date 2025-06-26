export const validateUrl = (url: string): { isValid: boolean; error?: string } => {
  if (!url || url.trim().length === 0) {
    return { isValid: false, error: 'URL is required' };
  }

  try {
    const urlObj = new URL(url);
    
    // Check if protocol is HTTP or HTTPS
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return { isValid: false, error: 'URL must use HTTP or HTTPS protocol' };
    }

    // Check if hostname is valid
    if (!urlObj.hostname || urlObj.hostname.length === 0) {
      return { isValid: false, error: 'URL must have a valid hostname' };
    }

    return { isValid: true };
  } catch (error) {
    return { isValid: false, error: 'Invalid URL format' };
  }
};

export const validateProjectName = (name: string): { isValid: boolean; error?: string } => {
  if (!name || name.trim().length === 0) {
    return { isValid: false, error: 'Project name is required' };
  }

  if (name.length < 2) {
    return { isValid: false, error: 'Project name must be at least 2 characters long' };
  }

  if (name.length > 255) {
    return { isValid: false, error: 'Project name cannot exceed 255 characters' };
  }

  // Check for valid characters (letters, numbers, spaces, hyphens, underscores)
  const validPattern = /^[a-zA-Z0-9\s\-_]+$/;
  if (!validPattern.test(name)) {
    return { isValid: false, error: 'Project name can only contain letters, numbers, spaces, hyphens, and underscores' };
  }

  return { isValid: true };
};

export const validateFile = (file: File): { isValid: boolean; error?: string } => {
  const maxSize = parseInt(process.env.REACT_APP_MAX_FILE_SIZE || '52428800'); // 50MB default
  const allowedTypes = (process.env.REACT_APP_ALLOWED_FILE_TYPES || '.xlsx,.xls,.csv').split(',');

  if (!file) {
    return { isValid: false, error: 'File is required' };
  }

  // Check file size
  if (file.size > maxSize) {
    const maxSizeMB = Math.round(maxSize / (1024 * 1024));
    return { isValid: false, error: `File size exceeds ${maxSizeMB}MB limit` };
  }

  // Check file extension
  const fileName = file.name.toLowerCase();
  const hasValidExtension = allowedTypes.some(type => fileName.endsWith(type.toLowerCase()));
  
  if (!hasValidExtension) {
    return { isValid: false, error: `File must be one of: ${allowedTypes.join(', ')}` };
  }

  // Check MIME type for additional security
  const allowedMimeTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls
    'text/csv', // .csv
    'application/csv' // .csv alternative
  ];

  if (!allowedMimeTypes.includes(file.type)) {
    return { isValid: false, error: 'Invalid file type detected' };
  }

  return { isValid: true };
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void => {
  let timeout: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};