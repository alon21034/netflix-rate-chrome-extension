interface ChromeStorageLocal {
  get(
    keys: string | string[] | Record<string, unknown> | null,
    callback: (items: Record<string, unknown>) => void,
  ): void;
  set(items: Record<string, unknown>, callback?: () => void): void;
}

interface ChromeApi {
  storage: {
    local: ChromeStorageLocal;
  };
}

declare const chrome: ChromeApi;
