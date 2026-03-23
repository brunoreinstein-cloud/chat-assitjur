/**
 * Converts a blob: URL to a data: URL by fetching its content.
 * Returns null if the conversion fails.
 */
export async function convertBlobUrlToDataUrl(
  url: string
): Promise<string | null> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
