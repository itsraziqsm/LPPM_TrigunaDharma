import { AsyncLocalStorage } from "async_hooks";
import { Request, Response, NextFunction } from "express";

/**
 * Menyimpan metadata request (IP + User-Agent) yang bisa diakses dari
 * service layer manapun, tanpa perlu meneruskan parameter ip/userAgent
 * secara manual lewat setiap fungsi service (yang akan mengubah signature
 * belasan fungsi publik yang sudah dipakai controller).
 *
 * Cara kerja: requestContext.middleware di-pasang paling awal di request
 * lifecycle (index.ts), men-set context untuk request yang sedang berjalan.
 * Semua kode yang dieksekusi di dalam scope request tsb (termasuk service
 * yang dipanggil beberapa layer di bawah controller) bisa baca context ini
 * lewat requestContext.get().
 *
 * Ini bukan variabel global biasa — AsyncLocalStorage otomatis mengisolasi
 * context per-request meski banyak request diproses bersamaan (concurrent),
 * jadi tidak ada risiko context "bocor" tertukar antar request.
 */
type RequestContextStore = {
  ip: string | null;
  userAgent: string | null;
};

const asyncLocalStorage = new AsyncLocalStorage<RequestContextStore>();

export const requestContext = {
  middleware(req: Request, _res: Response, next: NextFunction) {
    const store: RequestContextStore = {
      ip: req.ip ?? null,
      userAgent: req.headers["user-agent"] ?? null,
    };

    asyncLocalStorage.run(store, next);
  },

  get(): RequestContextStore {
    return asyncLocalStorage.getStore() ?? { ip: null, userAgent: null };
  },
};
