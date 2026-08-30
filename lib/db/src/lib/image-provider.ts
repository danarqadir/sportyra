export type LicensedImageResult = {
  url: string;
  width: number;
  height: number;
  author?: string;
  license?: string;
  source?: string;
};

export type ImageProviderConfig = {
  apiKey?: string;
  baseUrl?: string;
  fallbackEnabled?: boolean;
};

const DEFAULT_CONFIG: ImageProviderConfig = {
  fallbackEnabled: true,
};

export class SportsImageProvider {
  private config: ImageProviderConfig;

  constructor(config?: ImageProviderConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async resolveEntityImage(entityType: "team" | "player" | "competition" | "match", identifier: string | number): Promise<LicensedImageResult | null> {
    if (!this.config.apiKey) {
      return this.getFallbackImage(entityType, identifier);
    }
    try {
      const response = await fetch(
        `${this.config.baseUrl || "https://api.sportsimage.io"}/v1/${entityType}/${encodeURIComponent(String(identifier))}`,
        { headers: { Authorization: `Bearer ${this.config.apiKey}` }, signal: AbortSignal.timeout(5000) },
      );
      if (!response.ok) return this.getFallbackImage(entityType, identifier);
      const data = await response.json() as LicensedImageResult;
      return data;
    } catch {
      return this.getFallbackImage(entityType, identifier);
    }
  }

  private getFallbackImage(_entityType: string, _identifier: string | number): LicensedImageResult | null {
    return null;
  }
}

let providerInstance: SportsImageProvider | null = null;

export function getImageProvider(): SportsImageProvider {
  if (!providerInstance) {
    providerInstance = new SportsImageProvider({
      apiKey: process.env["SPORTS_IMAGE_API_KEY"],
      baseUrl: process.env["SPORTS_IMAGE_API_URL"],
      fallbackEnabled: true,
    });
  }
  return providerInstance;
}

export function resetImageProvider(): void {
  providerInstance = null;
}
